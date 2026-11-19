package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestCardDataStoragePreservesPreviousFileOnInvalidWrite(t *testing.T) {
	app := &App{profile: t.TempDir()}
	if data, err := app.ReadCardDataStorage(); err != nil || data != "" {
		t.Fatalf("new profile: %q, %v", data, err)
	}
	original := `{"schemaVersion":1,"active":{"source":"bundled","cards":[{"cardId":"sample"}]}}`
	if err := app.WriteCardDataStorage(original); err != nil {
		t.Fatal(err)
	}
	for _, invalid := range []string{`null`, `{"schemaVersion":2}`, `{"schemaVersion":1`} {
		if err := app.WriteCardDataStorage(invalid); err == nil {
			t.Fatalf("accepted invalid storage: %s", invalid)
		}
		if data, err := app.ReadCardDataStorage(); err != nil || data != original {
			t.Fatalf("invalid write changed saved catalogue: %q, %v", data, err)
		}
	}
	cleared := `{"schemaVersion":1}`
	if err := app.WriteCardDataStorage(cleared); err != nil {
		t.Fatal(err)
	}
	if data, err := app.ReadCardDataStorage(); err != nil || data != cleared {
		t.Fatalf("clear catalogue: %q, %v", data, err)
	}
}

type cardDataTransport func(*http.Request) (*http.Response, error)

func (f cardDataTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestCardDataRequestsPreserveSourceAndPagination(t *testing.T) {
	previous := cardDataClient
	defer func() { cardDataClient = previous }()
	ready := make(chan struct{})
	close(ready)
	app := &App{ctx: context.Background(), ready: ready}
	for _, source := range []string{"kardsplayer", "kardscom"} {
		t.Run(source, func(t *testing.T) {
			cardDataClient = &http.Client{Transport: cardDataTransport(func(req *http.Request) (*http.Response, error) {
				var payload struct {
					Query     string         `json:"query"`
					Variables map[string]any `json:"variables"`
				}
				if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
					t.Fatal(err)
				}
				if req.Method != "POST" || payload.Variables["first"] != float64(100) || payload.Variables["offset"] != float64(200) ||
					payload.Variables["showExiles"] != (source == "kardscom") || payload.Variables["showReserved"] != true ||
					!strings.Contains(payload.Query, "thumbUrl: image(") {
					t.Fatalf("request changed source or pagination: %+v", payload)
				}
				want := "api.kardsplayer.com"
				if source == "kardscom" {
					want = "herokuapi.kards.com"
					if req.Header.Get("Origin") != "https://www.kards.com" {
						t.Fatal("official source headers missing")
					}
				}
				if req.URL.Host != want {
					t.Fatalf("wrong source: %s", req.URL)
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"data":{"cards":{}}}`))}, nil
			})}
			if _, err := app.FetchCardDataPage(200, source); err != nil {
				t.Fatal(err)
			}
		})
	}
	for _, offset := range []int{-1, 100001} {
		if _, err := app.FetchCardDataPage(offset, "kardsplayer"); err == nil {
			t.Fatal("accepted invalid offset")
		}
	}
	if _, err := app.FetchCardDataPage(0, "unknown"); err == nil {
		t.Fatal("accepted unknown card source")
	}
}
