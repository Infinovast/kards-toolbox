package main

import (
	"context"
	"crypto/sha256"
	"embed"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	appName     = "KARDS Toolbox"
	windowClass = "KardsToolbox"
)

var (
	buildPackSalt         = "kards-toolbox-default-open-source-salt"
	buildVersion          = "dev"
	buildDeveloperOptions = "false"
)

// Build scripts stage both resource directories before compiling the desktop app.
//
//go:embed all:frontend all:bundled
var bundled embed.FS

func main() {
	if err := run(); err != nil {
		showStartupError(err)
		os.Exit(1)
	}
}

func run() error {
	profile, err := profileDirectory()
	if err != nil {
		return err
	}
	webview := filepath.Join(profile, "webview2")
	if err := os.MkdirAll(webview, 0700); err != nil {
		return fmt.Errorf("无法创建应用数据目录: %w", err)
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	frontend, err := fs.Sub(bundled, "frontend/dist")
	if err != nil {
		return err
	}
	if _, err := fs.Stat(frontend, "index.html"); err != nil {
		return fmt.Errorf("找不到界面文件: %w", err)
	}
	pack, err := bundled.Open("bundled/static.kpak")
	if err != nil {
		return fmt.Errorf("找不到静态资源包: %w", err)
	}
	defer pack.Close()
	info, err := pack.Stat()
	if err != nil {
		return err
	}
	packs, err := newPackService(profile, filepath.Dir(exe), pack.(io.ReaderAt), info.Size(), buildPackSalt)
	if err != nil {
		return err
	}
	app := &App{packs: packs, profile: profile, ready: make(chan struct{})}

	// A profile owns both its IndexedDB and the writable cards.kpak.
	// Windows paths are case-insensitive, so casing must not affect the lock.
	instanceID := fmt.Sprintf("kards-toolbox-%x", sha256.Sum256([]byte(strings.ToLower(profile))))
	return wails.Run(&options.App{
		Title: appName, Width: 1280, Height: 820, MinWidth: 980, MinHeight: 640,
		BackgroundColour: options.NewRGB(17, 17, 17),
		AssetServer:      &assetserver.Options{Assets: frontend, Handler: packs},
		OnStartup: func(ctx context.Context) {
			app.ctx = ctx
			setWindowIcons(systemDarkTheme())
			close(app.ready)
		},
		Bind: []interface{}{app},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: instanceID,
			OnSecondInstanceLaunch: func(options.SecondInstanceData) {
				select {
				case <-app.ready:
					runtime.WindowUnminimise(app.ctx)
					runtime.WindowShow(app.ctx)
				default:
				}
			},
		},
		Windows: &windows.Options{
			WebviewUserDataPath: webview,
			WindowClassName:     windowClass,
			DisablePinchZoom:    true,
		},
	})
}

func profileDirectory() (string, error) {
	if dir := os.Getenv("KARDS_USER_DATA_DIR"); dir != "" {
		if !filepath.IsAbs(dir) {
			return "", errors.New("KARDS_USER_DATA_DIR 必须是绝对路径")
		}
		return filepath.Clean(dir), nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "kards-toolbox"), nil
}
