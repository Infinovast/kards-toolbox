package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows/registry"
)

type App struct {
	ctx     context.Context
	packs   *PackService
	profile string
	ready   chan struct{}
}

func (a *App) runtimeContext() context.Context {
	<-a.ready
	return a.ctx
}

type AppInfo struct {
	Name             string `json:"name"`
	Version          string `json:"version"`
	UserDataPath     string `json:"userDataPath"`
	Packaged         bool   `json:"packaged"`
	DeveloperOptions bool   `json:"developerOptions"`
	DarkIcon         bool   `json:"darkIcon"`
}

func (a *App) GetAppInfo() AppInfo {
	return AppInfo{appName, buildVersion, a.profile, buildDeveloperOptions != "true", buildDeveloperOptions == "true", systemDarkTheme()}
}

func systemDarkTheme() bool {
	key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer key.Close()
	value, _, err := key.GetIntegerValue("AppsUseLightTheme")
	return err == nil && value == 0
}

func (a *App) SetTheme(mode string) (bool, error) {
	ctx := a.runtimeContext()
	dark := mode == "dark"
	switch mode {
	case "dark":
		runtime.WindowSetDarkTheme(ctx)
	case "light":
		runtime.WindowSetLightTheme(ctx)
	case "system":
		runtime.WindowSetSystemDefaultTheme(ctx)
		dark = systemDarkTheme()
	default:
		return false, errors.New("无效主题")
	}
	setWindowIcons(dark)
	if dark {
		runtime.WindowSetBackgroundColour(ctx, 17, 17, 17, 255)
	} else {
		runtime.WindowSetBackgroundColour(ctx, 246, 245, 241, 255)
	}
	return dark, nil
}

func (a *App) ReadClipboardText() (string, error) {
	return readWindowsClipboard()
}

func (a *App) PrepareCacheBundle() (*CacheBundleInfo, error) {
	return a.packs.PrepareCacheBundle()
}

func (a *App) FinishCacheBundle() error {
	return a.packs.FinishCacheBundle()
}

func (a *App) ListCardImageKeys() (CardPackStats, error) {
	return a.packs.ListCardImageKeys()
}

func (a *App) DeleteCardImages(refs []CardImageReference) error {
	return a.packs.DeleteCardImages(refs)
}

func (a *App) CompactCardPack() error {
	return a.packs.CompactCardPack()
}

func (a *App) CacheCardImage(ref CardImageReference) (CardImageMetadata, error) {
	return a.packs.CacheCardImage(ref)
}

type FileDialogResult struct {
	Canceled bool   `json:"canceled"`
	FilePath string `json:"filePath,omitempty"`
	Content  string `json:"content,omitempty"`
}

const maxBackupSize = 256 << 20

var backupFilter = []runtime.FileFilter{{DisplayName: "KARDS 备份文件", Pattern: "*.json"}}

func (a *App) SaveBackup(backup string) (FileDialogResult, error) {
	var body struct {
		SchemaVersion int                        `json:"schemaVersion"`
		Data          map[string]json.RawMessage `json:"data"`
	}
	if len(backup) > maxBackupSize || json.Unmarshal([]byte(backup), &body) != nil || body.SchemaVersion != 1 || body.Data == nil {
		return FileDialogResult{}, errors.New("备份数据无效或超过大小限制")
	}
	return a.saveFile(runtime.SaveDialogOptions{
		Title:           "导出 KARDS 工具箱备份",
		DefaultFilename: "kards-toolbox-backup-" + time.Now().Format(time.DateOnly) + ".json",
		Filters:         backupFilter,
	}, ".json", []byte(backup))
}

func (a *App) OpenBackup() (FileDialogResult, error) {
	path, err := runtime.OpenFileDialog(a.runtimeContext(), runtime.OpenDialogOptions{
		Title: "导入 KARDS 工具箱备份", Filters: backupFilter,
	})
	if err != nil || path == "" {
		return FileDialogResult{Canceled: true}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return FileDialogResult{}, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxBackupSize+1))
	if err != nil {
		return FileDialogResult{}, err
	}
	if len(data) > maxBackupSize {
		return FileDialogResult{}, errors.New("备份文件超过大小限制")
	}
	return FileDialogResult{FilePath: path, Content: string(data)}, nil
}

func (a *App) SaveDeckImage(dataURL, filename string) (FileDialogResult, error) {
	data, ok := strings.CutPrefix(dataURL, "data:image/png;base64,")
	if !ok || len(data) > 90<<20 {
		return FileDialogResult{}, errors.New("PNG 数据无效或超过大小限制")
	}
	image, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return FileDialogResult{}, errors.New("PNG 数据无效")
	}
	if _, err := png.DecodeConfig(bytes.NewReader(image)); err != nil {
		return FileDialogResult{}, fmt.Errorf("PNG 数据无效: %w", err)
	}
	filename = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
			return '_'
		}
		return r
	}, filename)
	filename = strings.Trim(filename, " .")
	if filename == "" {
		filename = "kards-deck"
	}
	if !strings.EqualFold(filepath.Ext(filename), ".png") {
		filename += ".png"
	}
	return a.saveFile(runtime.SaveDialogOptions{
		Title:           "保存卡组图",
		DefaultFilename: filename,
		Filters:         []runtime.FileFilter{{DisplayName: "PNG 图片", Pattern: "*.png"}},
	}, ".png", image)
}

func (a *App) saveFile(options runtime.SaveDialogOptions, extension string, data []byte) (FileDialogResult, error) {
	path, err := runtime.SaveFileDialog(a.runtimeContext(), options)
	if err != nil || path == "" {
		return FileDialogResult{Canceled: true}, err
	}
	if filepath.Ext(path) == "" {
		path += extension
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return FileDialogResult{}, err
	}
	return FileDialogResult{FilePath: path}, nil
}
