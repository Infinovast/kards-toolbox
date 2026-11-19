package main

import "golang.org/x/sys/windows"

func showStartupError(err error) {
	message := windows.StringToUTF16Ptr(err.Error())
	windows.MessageBox(0, message, windows.StringToUTF16Ptr(appName), windows.MB_ICONERROR|windows.MB_OK)
}
