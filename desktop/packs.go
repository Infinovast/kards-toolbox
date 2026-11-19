package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const maxDownloadImage = 10 << 20

var (
	cardIDPattern   = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,200}$`)
	cardURLPattern  = regexp.MustCompile(`^/images/card/v[0-9]+/[A-Za-z0-9_-]+/(thumb/)?[A-Za-z0-9_.-]+\.(avif|png|webp)$`)
	weatherPattern  = regexp.MustCompile(`(?i)^/CardImgs/temporary_weathers/(?:[A-Z0-9_.-]|%[0-9a-f]{2})+\.png$`)
	invalidAssetKey = regexp.MustCompile(`[\x00-\x1f:?#]`)
)

type CardImageReference struct {
	CardID  string `json:"cardId"`
	Variant string `json:"variant"`
	URL     string `json:"url"`
}

type CardImageMetadata struct {
	CardID    string `json:"cardId"`
	Variant   string `json:"variant"`
	URL       string `json:"url"`
	Key       string `json:"key"`
	Size      int64  `json:"size"`
	MIME      string `json:"mime"`
	UpdatedAt string `json:"updatedAt"`
}

type CardPackStats struct {
	Entries   []CardImageMetadata `json:"entries"`
	DeadBytes uint32              `json:"deadBytes"`
	FileBytes int64               `json:"fileBytes"`
}

type CacheBundleInfo struct {
	Database   json.RawMessage `json:"database,omitempty"`
	ImageCount int             `json:"imageCount"`
}

type preparedCacheBundle struct {
	info        CacheBundleInfo
	fingerprint string
}

type appliedCacheBundles struct {
	Version int             `json:"version"`
	Packs   map[string]bool `json:"packs"`
}

type PackService struct {
	mu           sync.RWMutex
	staticReader io.ReaderAt
	static       *kpak
	cards        *kpak
	cardPath     string
	distribution string
	marker       string
	salt         string
	preparing    *preparedCacheBundle
	client       *http.Client
}

func newPackService(profileDir, distributionDir string, static io.ReaderAt, staticSize int64, salt string) (*PackService, error) {
	if salt == "" {
		salt = defaultPackSalt
	}
	service := &PackService{
		staticReader: static,
		cardPath:     filepath.Join(profileDir, "packs", "cards.kpak"),
		marker:       filepath.Join(profileDir, "full-cache-applied.json"),
		salt:         salt,
		client: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
	if distributionDir != "" {
		service.distribution = filepath.Join(distributionDir, "cards.kpak")
	}
	if static != nil {
		var err error
		service.static, err = openKpak(static, staticSize, salt)
		if err != nil {
			return nil, fmt.Errorf("读取静态资源包: %w", err)
		}
	}
	return service, nil
}

func normalizeAssetPath(value string) (string, error) {
	key := strings.TrimLeft(strings.ReplaceAll(value, `\`, `/`), `/`)
	if !strings.HasPrefix(key, "assets/") || invalidAssetKey.MatchString(key) {
		return "", errors.New("资源路径无效")
	}
	for _, segment := range strings.Split(key, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return "", errors.New("资源路径无效")
		}
	}
	return key, nil
}

func validateCardImageURL(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	invalid := errors.New("卡图地址无效")
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", invalid
	}
	// HTTPS default and hostname case are normalized by the browser's URL class.
	host := strings.TrimSuffix(strings.ToLower(parsed.Host), ":443")
	escapedPath := parsed.EscapedPath()
	switch host {
	case "www.kardsplayer.com", "www.kards.com":
		if !cardURLPattern.MatchString(escapedPath) {
			return "", invalid
		}
	case "kards-assets.kardsdecker.com":
		if !weatherPattern.MatchString(escapedPath) {
			return "", invalid
		}
	default:
		return "", invalid
	}
	// Browsers preserve an empty '?' / '#' delimiter in href, but search and hash stay empty.
	parsed.Host = host
	canonical := parsed.String()
	if strings.HasSuffix(value, "#") {
		canonical += "#"
	}
	return canonical, nil
}

func validateCardImageReference(ref CardImageReference) (CardImageReference, error) {
	if !cardIDPattern.MatchString(ref.CardID) || (ref.Variant != "full" && ref.Variant != "thumb") {
		return ref, errors.New("卡图缓存标识无效")
	}
	canonical, err := validateCardImageURL(ref.URL)
	ref.URL = canonical
	return ref, err
}

func cardImagePackKey(ref CardImageReference, salt string) string {
	// JSON.stringify does not escape '&', '<' or '>' like Go's default JSON encoder.
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode([3]string{ref.CardID, ref.Variant, ref.URL})
	return hashPackKey(strings.TrimSuffix(buf.String(), "\n"), salt)
}

func encodeURIComponent(value string) string {
	const hex = "0123456789ABCDEF"
	var result strings.Builder
	for i := 0; i < len(value); i++ {
		b := value[i]
		if (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') || (b >= '0' && b <= '9') || strings.ContainsRune("-_.!~*'()", rune(b)) {
			result.WriteByte(b)
		} else {
			result.WriteByte('%')
			result.WriteByte(hex[b>>4])
			result.WriteByte(hex[b&15])
		}
	}
	return result.String()
}

func imageMetadata(ref CardImageReference, entry packEntry) CardImageMetadata {
	return CardImageMetadata{CardID: ref.CardID, Variant: ref.Variant, URL: ref.URL,
		Key:  "kards_card_pack_v2_" + encodeURIComponent(ref.CardID) + "_" + ref.Variant + "_" + encodeURIComponent(ref.URL),
		Size: entry.Size, MIME: entry.MIME, UpdatedAt: entry.UpdatedAt}
}

func validateCardPack(pack *kpak) error {
	for key, entry := range pack.Entries {
		if entry.Meta == nil {
			return errors.New("卡图索引缺少图片标识")
		}
		ref, err := validateCardImageReference(*entry.Meta)
		if err != nil || cardImagePackKey(ref, pack.salt) != key {
			return errors.New("卡图索引标识不匹配")
		}
	}
	return validatePackDatabase(pack.Database)
}

func validatePackDatabase(data json.RawMessage) error {
	if len(data) == 0 || bytes.Equal(data, []byte("null")) {
		return nil
	}
	var snapshot struct {
		Cards  []json.RawMessage `json:"cards"`
		Source string            `json:"source"`
	}
	if err := json.Unmarshal(data, &snapshot); err != nil || len(snapshot.Cards) == 0 {
		return errors.New("分发牌库无效")
	}
	switch snapshot.Source {
	case "bundled", "official", "kardsplayer", "kardscom":
		return nil
	}
	return errors.New("分发牌库来源无效")
}

func (s *PackService) loadCards() error {
	if s.cards != nil {
		return nil
	}
	if err := recoverKpak(s.cardPath); err != nil {
		return err
	}
	pack, err := openKpakFile(s.cardPath, s.salt)
	if err != nil {
		return err
	}
	if err := validateCardPack(pack); err != nil {
		return err
	}
	s.cards = pack
	return nil
}

func (s *PackService) ReadStaticAsset(path string) ([]byte, string, error) {
	key, err := normalizeAssetPath(path)
	if err != nil {
		return nil, "", err
	}
	if s.static == nil {
		return nil, "", os.ErrNotExist
	}
	return s.static.read(s.staticReader, hashPackKey(key, s.salt))
}

func (s *PackService) ReadCardImage(input CardImageReference) ([]byte, string, error) {
	ref, err := validateCardImageReference(input)
	if err != nil {
		return nil, "", err
	}
	key := cardImagePackKey(ref, s.salt)
	s.mu.RLock()
	if s.cards != nil {
		defer s.mu.RUnlock()
		return s.cards.readFile(s.cardPath, key)
	}
	s.mu.RUnlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadCards(); err != nil {
		return nil, "", err
	}
	return s.cards.readFile(s.cardPath, key)
}

func (s *PackService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var data []byte
	var mime, cache string
	var err error
	switch {
	case r.URL.Path == "/card-image":
		params := r.URL.Query()
		data, mime, err = s.ReadCardImage(CardImageReference{CardID: params.Get("cardId"), Variant: params.Get("variant"), URL: params.Get("url")})
		cache = "public, max-age=31536000, immutable"
	case strings.HasPrefix(r.URL.Path, "/assets/"):
		data, mime, err = s.ReadStaticAsset(r.URL.Path)
		cache = "no-cache"
	default:
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", cache)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(data))
}

func (s *PackService) PrepareCacheBundle() (*CacheBundleInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.preparing != nil {
		return &s.preparing.info, nil
	}
	if s.distribution == "" || strings.EqualFold(filepath.Clean(s.distribution), filepath.Clean(s.cardPath)) {
		return nil, nil
	}
	if _, err := os.Stat(s.distribution + ".idx.bak"); err == nil {
		return nil, errors.New("分发卡图包存在未完成的写入")
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	sourceFile, err := os.Open(s.distribution)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer sourceFile.Close()
	stat, err := sourceFile.Stat()
	if err != nil {
		return nil, err
	}
	source, err := openKpak(sourceFile, stat.Size(), s.salt)
	if err != nil {
		return nil, err
	}
	markers, err := s.appliedBundles()
	if err != nil {
		return nil, err
	}
	if markers.Packs[source.fingerprint] {
		return nil, nil
	}
	if err := validateCardPack(source); err != nil {
		return nil, err
	}
	if err := s.loadCards(); errors.Is(err, os.ErrNotExist) {
		if err := replacePackFile(s.cardPath, func(out *os.File) error {
			_, err := io.Copy(out, sourceFile)
			return err
		}); err != nil {
			return nil, err
		}
		s.cards = source
	} else if err != nil {
		return nil, err
	} else {
		for key := range source.Entries {
			if _, cached := s.cards.Entries[key]; cached {
				continue
			}
			if err := s.cards.change(s.cardPath, func(next *kpak, out *os.File) error {
				return copyPackEntries(source, sourceFile, next, out, true)
			}); err != nil {
				return nil, err
			}
			break
		}
	}
	s.preparing = &preparedCacheBundle{
		info:        CacheBundleInfo{Database: source.Database, ImageCount: len(source.Entries)},
		fingerprint: source.fingerprint,
	}
	return &s.preparing.info, nil
}

func (s *PackService) appliedBundles() (appliedCacheBundles, error) {
	result := appliedCacheBundles{Version: 1, Packs: make(map[string]bool)}
	data, err := os.ReadFile(s.marker)
	if errors.Is(err, os.ErrNotExist) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	var existing appliedCacheBundles
	// Legacy markers did not identify which pack was applied. Rechecking the sidecar is safe.
	if json.Unmarshal(data, &existing) == nil && existing.Version == result.Version && existing.Packs != nil {
		return existing, nil
	}
	return result, nil
}

func (s *PackService) FinishCacheBundle() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.preparing == nil {
		return nil
	}
	marker, err := s.appliedBundles()
	if err != nil {
		return err
	}
	marker.Packs[s.preparing.fingerprint] = true
	if err := replacePackFile(s.marker, func(file *os.File) error { return json.NewEncoder(file).Encode(marker) }); err != nil {
		return err
	}
	s.preparing = nil
	return nil
}

func (s *PackService) ListCardImageKeys() (CardPackStats, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	stats := CardPackStats{Entries: []CardImageMetadata{}}
	if err := s.loadCards(); errors.Is(err, os.ErrNotExist) {
		return stats, nil
	} else if err != nil {
		return stats, err
	}
	stats.DeadBytes, stats.FileBytes = s.cards.deadBytes, s.cards.fileBytes
	stats.Entries = make([]CardImageMetadata, 0, len(s.cards.Entries))
	for _, entry := range s.cards.Entries {
		stats.Entries = append(stats.Entries, imageMetadata(*entry.Meta, entry))
	}
	sort.Slice(stats.Entries, func(i, j int) bool { return stats.Entries[i].Key < stats.Entries[j].Key })
	return stats, nil
}

func (s *PackService) DeleteCardImages(refs []CardImageReference) error {
	keys := make([]string, 0, len(refs))
	for _, input := range refs {
		ref, err := validateCardImageReference(input)
		if err != nil {
			return err
		}
		keys = append(keys, cardImagePackKey(ref, s.salt))
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadCards(); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	var present []string
	for _, key := range keys {
		if _, exists := s.cards.Entries[key]; exists {
			present = append(present, key)
		}
	}
	if len(present) == 0 {
		return nil
	}
	if err := s.cards.change(s.cardPath, func(next *kpak, _ *os.File) error {
		for _, key := range present {
			if err := next.removeEntry(key); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	return s.maybeCompactCards()
}

func (s *PackService) CompactCardPack() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadCards(); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	return s.compactCards()
}

func (s *PackService) maybeCompactCards() error {
	if s.cards.deadBytes > 32<<20 && int64(s.cards.deadBytes)*5 > s.cards.fileBytes {
		return s.compactCards()
	}
	return nil
}

func (s *PackService) compactCards() error {
	if s.cards.deadBytes == 0 {
		return nil
	}
	next, err := writeKpak(s.cardPath, s.salt, s.cards.Database, func(next *kpak, out *os.File) error {
		source, err := os.Open(s.cardPath)
		if err != nil {
			return err
		}
		defer source.Close()
		return copyPackEntries(s.cards, source, next, out, false)
	})
	if err == nil {
		s.cards = next
	}
	return err
}

func copyPackEntries(source *kpak, sourceReader io.ReaderAt, target *kpak, targetFile *os.File, missingOnly bool) error {
	keys := make([]string, 0, len(source.Entries))
	for key := range source.Entries {
		if _, present := target.Entries[key]; !present || !missingOnly {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return source.Entries[keys[i]].Offset < source.Entries[keys[j]].Offset })
	for _, key := range keys {
		entry := source.Entries[key]
		data, mime, err := source.read(sourceReader, key)
		if err != nil {
			return err
		}
		if err := target.writeEntry(targetFile, packWrite{key: key, mime: mime, data: data, meta: entry.Meta, updatedAt: entry.UpdatedAt}); err != nil {
			return err
		}
	}
	return nil
}

func (s *PackService) CacheCardImage(input CardImageReference) (CardImageMetadata, error) {
	ref, err := validateCardImageReference(input)
	if err != nil {
		return CardImageMetadata{}, err
	}
	data, mime, err := s.downloadImage(ref.URL)
	if err != nil {
		return CardImageMetadata{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	item := packWrite{key: cardImagePackKey(ref, s.salt), mime: mime, data: data, meta: &ref}
	write := func(next *kpak, file *os.File) error { return next.writeEntry(file, item) }
	if err := s.loadCards(); errors.Is(err, os.ErrNotExist) {
		s.cards, err = writeKpak(s.cardPath, s.salt, nil, write)
		if err != nil {
			return CardImageMetadata{}, err
		}
	} else if err != nil {
		return CardImageMetadata{}, err
	} else if err := s.cards.change(s.cardPath, write); err != nil {
		return CardImageMetadata{}, err
	}
	if err := s.maybeCompactCards(); err != nil {
		return CardImageMetadata{}, err
	}
	return imageMetadata(ref, s.cards.Entries[item.key]), nil
}

func (s *PackService) downloadImage(canonical string) ([]byte, string, error) {
	response, err := s.client.Get(canonical)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, "", fmt.Errorf("卡图下载失败（%d）", response.StatusCode)
	}
	if response.ContentLength > maxDownloadImage {
		return nil, "", errors.New("卡图文件过大")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxDownloadImage+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 || len(data) > maxDownloadImage {
		return nil, "", errors.New("卡图文件大小无效")
	}
	switch {
	case bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")):
		return data, "image/png", nil
	case bytes.HasPrefix(data, []byte("\xff\xd8\xff")):
		return data, "image/jpeg", nil
	case len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		return data, "image/webp", nil
	case len(data) >= 16 && string(data[4:8]) == "ftyp":
		size := int(binary.BigEndian.Uint32(data[:4]))
		if size >= 16 && size <= len(data) {
			for cursor := 8; cursor+4 <= size; cursor += 4 {
				if brand := string(data[cursor : cursor+4]); brand == "avif" || brand == "avis" {
					return data, "image/avif", nil
				}
			}
		}
	}
	return nil, "", errors.New("卡图响应不是有效图片")
}
