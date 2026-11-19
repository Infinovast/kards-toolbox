package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var (
	fullCard  = CardImageReference{CardID: "sample", Variant: "full", URL: "https://www.kardsplayer.com/images/card/v54/zh-Hans/sample.avif"}
	thumbCard = CardImageReference{CardID: "sample", Variant: "thumb", URL: "https://www.kardsplayer.com/images/card/v54/zh-Hans/thumb/sample.avif"}
	testPNG   = []byte("\x89PNG\r\n\x1a\nimage bytes")
)

func addFixture(t *testing.T, path string, database json.RawMessage, refs ...CardImageReference) *kpak {
	t.Helper()
	pack, err := writeKpak(path, defaultPackSalt, database, func(pack *kpak, file *os.File) error {
		for _, ref := range refs {
			if err := pack.writeEntry(file, packWrite{key: cardImagePackKey(ref, defaultPackSalt), data: testPNG, mime: "image/png", meta: &ref}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return pack
}

func testPackService(t *testing.T, profile, distribution string) *PackService {
	t.Helper()
	service, err := newPackService(profile, distribution, nil, 0, defaultPackSalt)
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func TestImportPackAndServeCachedCards(t *testing.T) {
	distribution, profile := t.TempDir(), t.TempDir()
	source := filepath.Join(distribution, "cards.kpak")
	database := json.RawMessage(`{"cards":[{"cardId":"sample"}],"source":"bundled","fetchedAt":null}`)
	addFixture(t, source, database, fullCard, thumbCard)
	service := testPackService(t, profile, distribution)
	if stats, err := service.ListCardImageKeys(); err != nil || len(stats.Entries) != 0 {
		t.Fatalf("new profile inventory: %+v, %v", stats, err)
	}
	info, err := service.PrepareCacheBundle()
	if err != nil || info == nil || info.ImageCount != 2 || !bytes.Equal(info.Database, database) {
		t.Fatalf("prepared bundle: %+v, %v", info, err)
	}
	before, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if result, err := os.ReadFile(service.cardPath); err != nil || !bytes.Equal(before, result) {
		t.Fatalf("fresh profile must retain the pack bytes: %v", err)
	}
	for _, ref := range []CardImageReference{fullCard, thumbCard} {
		query := url.Values{"cardId": {ref.CardID}, "variant": {ref.Variant}, "url": {ref.URL}}
		request := httptest.NewRequest(http.MethodGet, "/card-image?"+query.Encode(), nil)
		result := httptest.NewRecorder()
		service.ServeHTTP(result, request)
		if result.Code != http.StatusOK || result.Header().Get("Content-Type") != "image/png" || !bytes.Equal(result.Body.Bytes(), testPNG) {
			t.Fatalf("%s image response: %d %v", ref.Variant, result.Code, result.Header())
		}
	}
	if err := service.FinishCacheBundle(); err != nil {
		t.Fatal(err)
	}
	reopened := testPackService(t, profile, distribution)
	if info, err := reopened.PrepareCacheBundle(); err != nil || info != nil {
		t.Fatalf("finished bundle should be skipped after restart: %+v, %v", info, err)
	}
	if result, err := os.ReadFile(source); err != nil || !bytes.Equal(before, result) {
		t.Fatalf("must keep the reusable distribution pack: %v", err)
	}
}

func TestPackMergeDownloadDeleteAndCompact(t *testing.T) {
	distribution, profile := t.TempDir(), t.TempDir()
	service := testPackService(t, profile, distribution)
	addFixture(t, service.cardPath, nil, fullCard)
	addFixture(t, filepath.Join(distribution, "cards.kpak"), nil, thumbCard)
	if info, err := service.PrepareCacheBundle(); err != nil || info == nil || info.ImageCount != 1 {
		t.Fatalf("prepared merge: %+v %v", info, err)
	}
	stats, err := service.ListCardImageKeys()
	if err != nil || len(stats.Entries) != 2 {
		t.Fatalf("merged inventory: %+v, %v", stats, err)
	}
	service.client.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.String() != fullCard.URL {
			t.Fatalf("unexpected destination %s", req.URL)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(testPNG)), ContentLength: int64(len(testPNG))}, nil
	})
	meta, err := service.CacheCardImage(fullCard)
	if err != nil || meta.Key != "kards_card_pack_v2_sample_full_https%3A%2F%2Fwww.kardsplayer.com%2Fimages%2Fcard%2Fv54%2Fzh-Hans%2Fsample.avif" || meta.MIME != "image/png" {
		t.Fatalf("cached image metadata: %+v, %v", meta, err)
	}
	if err := service.DeleteCardImages([]CardImageReference{thumbCard}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.ReadCardImage(thumbCard); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("deleted image remains accessible: %v", err)
	}
	stats, err = service.ListCardImageKeys()
	if err != nil || len(stats.Entries) != 1 || stats.DeadBytes != uint32(len(testPNG)*2) {
		t.Fatalf("deleted and replaced data must be accounted for: %+v, %v", stats, err)
	}
	if err := service.CompactCardPack(); err != nil {
		t.Fatal(err)
	}
	stats, err = testPackService(t, profile, "").ListCardImageKeys()
	if err != nil || len(stats.Entries) != 1 || stats.DeadBytes != 0 {
		t.Fatalf("compacted inventory after restart: %+v, %v", stats, err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func TestPackRestoresTailAfterFailedAppend(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cards.kpak")
	pack := addFixture(t, path, nil, fullCard)
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := errors.New("interrupted write")
	err = pack.change(path, func(next *kpak, file *os.File) error {
		ref := thumbCard
		if err := next.writeEntry(file, packWrite{key: cardImagePackKey(ref, next.salt), data: testPNG, mime: "image/png", meta: &ref}); err != nil {
			t.Fatal(err)
		}
		return want
	})
	if !errors.Is(err, want) {
		t.Fatalf("expected interruption after writing image: %v", err)
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatalf("original pack must be restored: %v", err)
	}
	if _, err := os.Stat(path + ".idx.bak"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("recovery marker should be removed after rollback: %v", err)
	}
}

func TestReadExistingKpak(t *testing.T) {
	path, staticPath := os.Getenv("KARDS_TEST_CARD_PACK"), os.Getenv("KARDS_TEST_STATIC_PACK")
	if path == "" || staticPath == "" {
		t.Skip("existing cache and static KPAK files were not supplied")
	}
	cards, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer cards.Close()
	info, err := cards.Stat()
	if err != nil {
		t.Fatal(err)
	}
	pack, err := openKpak(cards, info.Size(), defaultPackSalt)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateCardPack(pack); err != nil {
		t.Fatal(err)
	}
	if len(pack.Entries) == 0 {
		t.Fatal("no cached images to verify")
	}
	for key := range pack.Entries {
		if _, _, err := pack.read(cards, key); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("validated %d images from the existing cache", len(pack.Entries))
	static, err := os.Open(staticPath)
	if err != nil {
		t.Fatal(err)
	}
	defer static.Close()
	info, err = static.Stat()
	if err != nil {
		t.Fatal(err)
	}
	service, err := newPackService(t.TempDir(), "", static, info.Size(), defaultPackSalt)
	if err != nil {
		t.Fatal(err)
	}
	result := httptest.NewRecorder()
	service.ServeHTTP(result, httptest.NewRequest(http.MethodGet, "/assets/faction_icons/Anzac/Australia_flag.svg", nil))
	if result.Code != http.StatusOK || result.Header().Get("Content-Type") != "image/svg+xml" || !strings.Contains(result.Body.String(), "<svg") {
		t.Fatalf("production SVG resource: %d %v", result.Code, result.Header())
	}
}
