package main

import (
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const newsSource = "https://www.kardsplayer.com/zh/news"
const maxNewsPageBytes = 4 << 20

var newsRoute = regexp.MustCompile(`^/api/news(?:/([a-z0-9]+(?:-[a-z0-9]+)*))?$`)
var newsClient = &http.Client{
	Timeout: 12 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

func serveNews(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/news" && !strings.HasPrefix(r.URL.Path, "/api/news/") {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		match := newsRoute.FindStringSubmatch(r.URL.Path)
		if match == nil || len(match[1]) > 256 {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		url := newsSource
		if match[1] != "" {
			url += "/" + match[1]
		}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		req.Header.Set("Cache-Control", "no-cache")
		response, err := newsClient.Do(req)
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		body, err := io.ReadAll(io.LimitReader(response.Body, maxNewsPageBytes+1))
		if err != nil || len(body) > maxNewsPageBytes {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write(body)
	})
}
