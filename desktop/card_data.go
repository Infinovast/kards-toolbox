package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const cardDataQuery = `query getCards($language: String, $offset: Int, $first: Int, $showSpawnables: Boolean, $showExiles: Boolean, $showReserved: Boolean) {
  cards(language: $language, first: $first, offset: $offset, showSpawnables: $showSpawnables, showExiles: $showExiles, showReserved: $showReserved) {
    pageInfo { count hasNextPage }
    edges { node { id cardId importId json reserved imageUrl: image(language: $language) thumbUrl: image(type: thumb, language: $language) } }
  }
}`

var cardDataClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

const maxCardDataBytes = 64 << 20

func (a *App) ReadCardDataStorage() (string, error) {
	f, err := os.Open(filepath.Join(a.profile, "card-data.json"))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxCardDataBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxCardDataBytes {
		return "", errors.New("本地牌库超过大小限制")
	}
	return string(data), nil
}

func (a *App) WriteCardDataStorage(data string) error {
	var stored struct {
		SchemaVersion int `json:"schemaVersion"`
	}
	if len(data) > maxCardDataBytes || json.Unmarshal([]byte(data), &stored) != nil || stored.SchemaVersion != 1 {
		return errors.New("本地牌库无效或超过大小限制")
	}
	return replacePackFile(filepath.Join(a.profile, "card-data.json"), func(file *os.File) error {
		_, err := file.WriteString(data)
		return err
	})
}

// Keep the catalogue schema validation and normalization in the frontend.
func (a *App) FetchCardDataPage(offset int, source string) (string, error) {
	if offset < 0 || offset > 100000 {
		return "", errors.New("分页参数无效")
	}
	var endpoint, sourceName string
	switch source {
	case "kardsplayer":
		endpoint = "https://api.kardsplayer.com/graphql"
		sourceName = "Kardsplayer"
	case "kardscom":
		endpoint = "https://herokuapi.kards.com/graphql"
		sourceName = "KARDS 官方"
	default:
		return "", errors.New("牌库来源无效")
	}
	payload, err := json.Marshal(map[string]any{
		"operationName": "getCards",
		"query":         cardDataQuery,
		"variables": map[string]any{
			"language": "zh", "first": 100, "offset": offset,
			"showSpawnables": true, "showExiles": source == "kardscom", "showReserved": true,
		},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(a.runtimeContext(), http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if source == "kardscom" {
		req.Header.Set("Accept", "*/*")
		req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
		req.Header.Set("Cache-Control", "no-cache")
		req.Header.Set("Origin", "https://www.kards.com")
		req.Header.Set("Pragma", "no-cache")
		req.Header.Set("Referer", "https://www.kards.com/")
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36")
	}
	res, err := cardDataClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("获取 %s 卡牌数据失败: %w", sourceName, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("获取 %s 卡牌数据失败（HTTP %d）", sourceName, res.StatusCode)
	}
	const maxPageBytes = 8 << 20
	body, err := io.ReadAll(io.LimitReader(res.Body, maxPageBytes+1))
	if err != nil {
		return "", err
	}
	if len(body) > maxPageBytes || !json.Valid(body) {
		return "", fmt.Errorf("%s 返回的卡牌数据无效", sourceName)
	}
	return string(body), nil
}
