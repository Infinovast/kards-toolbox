package main

import (
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	iconUser32    = windows.NewLazySystemDLL("user32.dll")
	findWindowEx  = iconUser32.NewProc("FindWindowExW")
	windowProcess = iconUser32.NewProc("GetWindowThreadProcessId")
	loadImage     = iconUser32.NewProc("LoadImageW")
	systemMetric  = iconUser32.NewProc("GetSystemMetrics")
	sendWindowMsg = iconUser32.NewProc("SendMessageW")
)

func setWindowIcons(dark bool) {
	class := windows.StringToUTF16Ptr(windowClass)
	var hwnd uintptr
	for {
		hwnd, _, _ = findWindowEx.Call(0, hwnd, uintptr(unsafe.Pointer(class)), 0)
		if hwnd == 0 {
			return
		}
		var owner uint32
		windowProcess.Call(hwnd, uintptr(unsafe.Pointer(&owner)))
		if owner == uint32(os.Getpid()) {
			break
		}
	}
	var module windows.Handle
	if windows.GetModuleHandleEx(windows.GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, nil, &module) != nil {
		return
	}
	resourceID := uintptr(3)
	if dark {
		resourceID = 4
	}
	set := func(kind, widthMetric, heightMetric uintptr) {
		width, _, _ := systemMetric.Call(widthMetric)
		height, _, _ := systemMetric.Call(heightMetric)
		// IMAGE_ICON and LR_SHARED. Windows owns these executable resources.
		icon, _, _ := loadImage.Call(uintptr(module), resourceID, 1, width, height, 0x8000)
		if icon != 0 {
			sendWindowMsg.Call(hwnd, 0x0080, kind, icon) // WM_SETICON
		}
	}
	set(0, 49, 50) // ICON_SMALL, SM_CXSMICON, SM_CYSMICON
	set(1, 11, 12) // ICON_BIG, SM_CXICON, SM_CYICON
}
