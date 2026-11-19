// Command winresources generates the Windows icon, manifest, and version resource.
package main

import (
	"fmt"
	"image/png"
	"os"

	"github.com/tc-hib/winres"
	"github.com/tc-hib/winres/version"
)

func main() {
	if len(os.Args) != 5 {
		fmt.Fprintln(os.Stderr, "usage: winresources black.png white.png version output.syso")
		os.Exit(2)
	}
	if err := writeResources(os.Args[1], os.Args[2], os.Args[3], os.Args[4]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func loadIcon(iconPath string) (*winres.Icon, error) {
	file, err := os.Open(iconPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	img, err := png.Decode(file)
	if err != nil {
		return nil, err
	}
	return winres.NewIconFromResizedImage(img, []int{16, 24, 32, 48, 64, 128, 256})
}

func writeResources(blackIcon, whiteIcon, appVersion, output string) error {
	const name = "KARDS Toolbox"
	var resources winres.ResourceSet
	for i, file := range []string{blackIcon, whiteIcon} {
		icon, err := loadIcon(file)
		if err != nil {
			return err
		}
		// Wails uses icon group 3 for the window by default.
		if err := resources.SetIcon(winres.ID(3+i), icon); err != nil {
			return err
		}
	}
	resources.SetManifest(winres.AppManifest{
		Identity:    winres.AssemblyIdentity{Name: "com.kards.localtool"},
		Description: name, Compatibility: winres.Win10AndAbove,
		DPIAwareness: winres.DPIPerMonitorV2, UseCommonControlsV6: true,
	})
	var info version.Info
	info.SetFileVersion(appVersion)
	info.SetProductVersion(appVersion)
	for key, value := range map[string]string{
		"ProductName": name, "FileDescription": name,
		"InternalName": "kards_toolbox", "OriginalFilename": "kards_toolbox.exe",
	} {
		if err := info.Set(0x0409, key, value); err != nil {
			return err
		}
	}
	resources.SetVersionInfo(info)
	result, err := os.Create(output)
	if err != nil {
		return err
	}
	if err = resources.WriteObject(result, winres.ArchAMD64); err != nil {
		result.Close()
		return err
	}
	return result.Close()
}
