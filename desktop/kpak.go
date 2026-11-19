package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"time"

	"github.com/andybalholm/brotli"
)

const (
	defaultPackSalt = "kards-toolbox-default-open-source-salt"
	packVersion     = 2
	packHeaderSize  = 16
	packFooterSize  = 32
	maxPackIndex    = 64 << 20
	maxPackEntry    = 64 << 20
)

var packKeyPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

type packEntry struct {
	Offset    int64               `json:"offset"`
	Size      int64               `json:"size"`
	MIME      string              `json:"mime"`
	UpdatedAt string              `json:"updatedAt"`
	CRC32     uint32              `json:"crc32"`
	Meta      *CardImageReference `json:"meta,omitempty"`
}

type packIndex struct {
	Version  int                  `json:"version"`
	SaltID   string               `json:"saltId"`
	Entries  map[string]packEntry `json:"entries"`
	Database json.RawMessage      `json:"database,omitempty"`
}

type kpak struct {
	packIndex
	salt        string
	fingerprint string
	indexOffset int64
	fileBytes   int64
	deadBytes   uint32
}

func hashPackKey(key, salt string) string {
	hash := hmac.New(sha256.New, []byte(salt))
	hash.Write([]byte(key))
	return hex.EncodeToString(hash.Sum(nil)[:16])
}

func maskPackBytes(data []byte, offset int64, salt string) {
	mask := sha256.Sum256([]byte(salt + ":" + strconv.FormatInt(offset, 10)))
	for i := 0; i < min(128, len(data)); i++ {
		data[i] ^= mask[i%len(mask)]
	}
}

func validPackMIME(mime string) bool {
	switch mime {
	case "image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/avif", "image/gif":
		return true
	}
	return false
}

func openKpak(reader io.ReaderAt, size int64, salt string) (*kpak, error) {
	if size < packHeaderSize+packFooterSize {
		return nil, errors.New("图包过短")
	}
	var header [packHeaderSize]byte
	var footer [packFooterSize]byte
	if _, err := reader.ReadAt(header[:], 0); err != nil {
		return nil, err
	}
	if _, err := reader.ReadAt(footer[:], size-packFooterSize); err != nil {
		return nil, err
	}
	if string(header[:8]) != "KARDSPAK" || binary.LittleEndian.Uint32(header[8:]) != packVersion || binary.LittleEndian.Uint32(header[12:]) != 1 || string(footer[24:]) != "KARDSEND" {
		return nil, errors.New("图包格式或尾部无效")
	}
	offset := binary.LittleEndian.Uint64(footer[:8])
	length := binary.LittleEndian.Uint64(footer[8:16])
	if offset < packHeaderSize || length == 0 || length > maxPackIndex || offset > uint64(size) || uint64(size)-offset != length+packFooterSize {
		return nil, errors.New("图包索引边界无效")
	}
	compressed := io.NewSectionReader(reader, int64(offset), int64(length))
	decoded, err := io.ReadAll(io.LimitReader(brotli.NewReader(compressed), maxPackIndex+1))
	if err != nil || len(decoded) > maxPackIndex {
		return nil, errors.New("图包索引解码失败")
	}
	var index packIndex
	if err := json.Unmarshal(decoded, &index); err != nil || index.Entries == nil {
		return nil, errors.New("图包索引无效")
	}
	if index.Version != packVersion || index.SaltID != hashPackKey("kards-pack-salt-check", salt) {
		return nil, errors.New("图包版本或 KARDS_PACK_SALT 不匹配")
	}
	if uint64(len(index.Entries)) != uint64(binary.LittleEndian.Uint32(footer[16:20])) {
		return nil, errors.New("图包条目数不符")
	}
	ordered := make([]packEntry, 0, len(index.Entries))
	for key, entry := range index.Entries {
		if !packKeyPattern.MatchString(key) || entry.Offset < packHeaderSize || entry.Offset > int64(offset) || entry.Size < 1 || entry.Size > maxPackEntry || entry.Size > int64(offset)-entry.Offset || !validPackMIME(entry.MIME) {
			return nil, errors.New("图包条目无效")
		}
		ordered = append(ordered, entry)
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Offset < ordered[j].Offset })
	end := int64(packHeaderSize)
	for _, entry := range ordered {
		if entry.Offset < end {
			return nil, errors.New("图包数据重叠")
		}
		end = entry.Offset + entry.Size
	}
	digest := sha256.Sum256(decoded)
	return &kpak{packIndex: index, salt: salt, fingerprint: hex.EncodeToString(digest[:]), indexOffset: int64(offset), fileBytes: size, deadBytes: binary.LittleEndian.Uint32(footer[20:24])}, nil
}

func openKpakFile(path, salt string) (*kpak, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	return openKpak(file, info.Size(), salt)
}

func (p *kpak) read(reader io.ReaderAt, key string) ([]byte, string, error) {
	entry, exists := p.Entries[key]
	if !exists {
		return nil, "", os.ErrNotExist
	}
	data := make([]byte, entry.Size)
	if _, err := reader.ReadAt(data, entry.Offset); err != nil {
		return nil, "", err
	}
	maskPackBytes(data, entry.Offset, p.salt)
	if crc32.ChecksumIEEE(data) != entry.CRC32 {
		return nil, "", errors.New("图包图片 CRC32 校验失败")
	}
	return data, entry.MIME, nil
}

func (p *kpak) readFile(path, key string) ([]byte, string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer file.Close()
	return p.read(file, key)
}

func emptyKpak(salt string) *kpak {
	return &kpak{
		packIndex: packIndex{Version: packVersion, SaltID: hashPackKey("kards-pack-salt-check", salt), Entries: make(map[string]packEntry)},
		salt:      salt, indexOffset: packHeaderSize,
	}
}

func (p *kpak) writeTail(file *os.File) error {
	encoded, err := json.Marshal(p.packIndex)
	if err != nil {
		return err
	}
	if len(encoded) > maxPackIndex {
		return errors.New("图包索引过大")
	}
	var buf bytes.Buffer
	writer := brotli.NewWriterLevel(&buf, 4)
	if _, err := writer.Write(encoded); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	if buf.Len() > maxPackIndex {
		return errors.New("压缩后的图包索引过大")
	}
	var footer [packFooterSize]byte
	binary.LittleEndian.PutUint64(footer[:8], uint64(p.indexOffset))
	binary.LittleEndian.PutUint64(footer[8:16], uint64(buf.Len()))
	binary.LittleEndian.PutUint32(footer[16:20], uint32(len(p.Entries)))
	binary.LittleEndian.PutUint32(footer[20:24], p.deadBytes)
	copy(footer[24:], "KARDSEND")
	if _, err := file.WriteAt(buf.Bytes(), p.indexOffset); err != nil {
		return err
	}
	if _, err := file.WriteAt(footer[:], p.indexOffset+int64(buf.Len())); err != nil {
		return err
	}
	p.fileBytes = p.indexOffset + int64(buf.Len()) + packFooterSize
	return file.Truncate(p.fileBytes)
}

// Write a replacement in the destination directory. An incomplete write leaves the old file intact.
func replacePackFile(path string, write func(*os.File) error) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".kpak-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	err = write(file)
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

type packWrite struct {
	key, mime, updatedAt string
	data                 []byte
	meta                 *CardImageReference
}

func (p *kpak) writeEntry(file *os.File, item packWrite) error {
	if !packKeyPattern.MatchString(item.key) || len(item.data) == 0 || len(item.data) > maxPackEntry || !validPackMIME(item.mime) {
		return errors.New("写入图包的图片无效")
	}
	if err := p.removeEntry(item.key); err != nil {
		return err
	}
	stamp := item.updatedAt
	if stamp == "" {
		stamp = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	}
	entry := packEntry{Offset: p.indexOffset, Size: int64(len(item.data)), MIME: item.mime, CRC32: crc32.ChecksumIEEE(item.data), UpdatedAt: stamp, Meta: item.meta}
	maskPackBytes(item.data, entry.Offset, p.salt)
	_, err := file.WriteAt(item.data, entry.Offset)
	maskPackBytes(item.data, entry.Offset, p.salt)
	if err != nil {
		return err
	}
	p.Entries[item.key] = entry
	p.indexOffset += entry.Size
	return nil
}

func (p *kpak) removeEntry(key string) error {
	if entry, exists := p.Entries[key]; exists {
		dead := uint64(p.deadBytes) + uint64(entry.Size)
		if dead > 0xffffffff {
			return errors.New("图包碎片超过格式上限，请先整理")
		}
		p.deadBytes = uint32(dead)
		delete(p.Entries, key)
	}
	return nil
}

func writeKpak(path, salt string, database json.RawMessage, write func(*kpak, *os.File) error) (*kpak, error) {
	pack := emptyKpak(salt)
	pack.Database = database
	err := replacePackFile(path, func(file *os.File) error {
		var header [packHeaderSize]byte
		copy(header[:8], "KARDSPAK")
		binary.LittleEndian.PutUint32(header[8:12], packVersion)
		binary.LittleEndian.PutUint32(header[12:16], 1)
		if _, err := file.Write(header[:]); err != nil {
			return err
		}
		if err := write(pack, file); err != nil {
			return err
		}
		return pack.writeTail(file)
	})
	if err != nil {
		return nil, err
	}
	return pack, nil
}

func recoverKpak(path string) error {
	backup := path + ".idx.bak"
	file, err := os.Open(backup)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	data, readErr := io.ReadAll(io.LimitReader(file, maxPackIndex+16+packFooterSize+1))
	file.Close()
	if readErr != nil {
		return readErr
	}
	if len(data) < 16+packFooterSize || len(data) > maxPackIndex+16+packFooterSize || string(data[:8]) != "KARDSBAK" || string(data[len(data)-8:]) != "KARDSEND" {
		return errors.New("图包恢复备份损坏")
	}
	offset := int64(binary.LittleEndian.Uint64(data[8:16]))
	footer := data[len(data)-packFooterSize:]
	if offset < packHeaderSize || binary.LittleEndian.Uint64(footer[:8]) != uint64(offset) || binary.LittleEndian.Uint64(footer[8:16]) != uint64(len(data)-16-packFooterSize) {
		return errors.New("图包恢复位置无效")
	}
	target, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	info, err := target.Stat()
	if err == nil && offset > info.Size() {
		err = errors.New("图包恢复位置无效")
	}
	if err == nil {
		_, err = target.WriteAt(data[16:], offset)
	}
	if err == nil {
		err = target.Truncate(offset + int64(len(data)-16))
	}
	if err == nil {
		err = target.Sync()
	}
	if closeErr := target.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Remove(backup)
}

// Keep the old index on disk before appending. Restore it after a failed or interrupted write.
func (p *kpak) change(path string, write func(*kpak, *os.File) error) error {
	if err := recoverKpak(path); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	backup := path + ".idx.bak"
	err = replacePackFile(backup, func(out *os.File) error {
		var prefix [16]byte
		copy(prefix[:8], "KARDSBAK")
		binary.LittleEndian.PutUint64(prefix[8:], uint64(p.indexOffset))
		if _, err := out.Write(prefix[:]); err != nil {
			return err
		}
		tailSize := p.fileBytes - p.indexOffset
		_, err := io.CopyN(out, io.NewSectionReader(file, p.indexOffset, tailSize), tailSize)
		return err
	})
	if err != nil {
		file.Close()
		return err
	}
	next := *p
	next.Entries = make(map[string]packEntry, len(p.Entries))
	for key, entry := range p.Entries {
		next.Entries[key] = entry
	}
	err = write(&next, file)
	if err == nil {
		err = next.writeTail(file)
	}
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Remove(backup)
	}
	if err != nil {
		if recoveryErr := recoverKpak(path); recoveryErr != nil {
			return errors.Join(err, fmt.Errorf("图包恢复失败: %w", recoveryErr))
		}
		return err
	}
	*p = next
	return nil
}
