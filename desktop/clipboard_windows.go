package main

import (
	"errors"
	"runtime"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	clipboardAPI               = windows.NewLazySystemDLL("user32.dll")
	openClipboard              = clipboardAPI.NewProc("OpenClipboard")
	closeClipboard             = clipboardAPI.NewProc("CloseClipboard")
	isClipboardFormatAvailable = clipboardAPI.NewProc("IsClipboardFormatAvailable")
	getClipboardData           = clipboardAPI.NewProc("GetClipboardData")

	clipboardMemory = windows.NewLazySystemDLL("kernel32.dll")
	globalSize      = clipboardMemory.NewProc("GlobalSize")
	globalLock      = clipboardMemory.NewProc("GlobalLock")
	globalUnlock    = clipboardMemory.NewProc("GlobalUnlock")
)

func readWindowsClipboard() (string, error) {
	const cfUnicodeText = 13
	const maxTextBytes = 2 << 20

	// OpenClipboard and CloseClipboard must run on the same Windows thread.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	for attempt := 0; ; attempt++ {
		if opened, _, err := openClipboard.Call(0); opened != 0 {
			break
		} else if attempt == 9 {
			return "", err
		}
		time.Sleep(10 * time.Millisecond)
	}
	defer closeClipboard.Call()

	if available, _, _ := isClipboardFormatAvailable.Call(cfUnicodeText); available == 0 {
		return "", nil
	}
	handle, _, err := getClipboardData.Call(cfUnicodeText)
	if handle == 0 {
		return "", err
	}
	size, _, err := globalSize.Call(handle)
	if size == 0 {
		return "", err
	}
	if size > maxTextBytes {
		return "", errors.New("剪贴板文本超过大小限制")
	}
	address, _, err := globalLock.Call(handle)
	if address == 0 {
		return "", err
	}
	// GlobalUnlock returns zero when the lock count reaches zero.
	defer globalUnlock.Call(handle)
	text := make([]uint16, size/2)
	if len(text) == 0 {
		return "", nil
	}
	// Copy from the locked Win32 allocation without treating its address
	// as a Go pointer.
	var read uintptr
	bytes := uintptr(len(text)) * 2
	if err := windows.ReadProcessMemory(windows.CurrentProcess(), address, (*byte)(unsafe.Pointer(&text[0])), bytes, &read); err != nil {
		return "", err
	}
	if read != bytes {
		return "", errors.New("未能完整读取剪贴板文本")
	}
	return windows.UTF16ToString(text), nil
}
