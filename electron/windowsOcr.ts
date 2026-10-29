import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { WindowsOcrResult } from '../src/lib/deckImageImport';

const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq ('IAsyncOperation' + [char]96 + '1')
} | Select-Object -First 1
function Await($operation, [Type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:KARDS_OCR_IMAGE)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  try {
    $languages = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Where-Object { $_.LanguageTag -match '^(zh|en)' })
    if (!$languages.Count) { $languages = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Select-Object -First 1) }
    $passes = @()
    foreach ($language in $languages) {
      $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
      if (!$engine) { continue }
      $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      $passes += @{ language = $language.LanguageTag; lines = @($result.Lines | ForEach-Object { $_.Text }) }
    }
    ConvertTo-Json -InputObject @{ passes = $passes } -Depth 5 -Compress
  } finally { $bitmap.Dispose() }
} finally { $stream.Dispose() }
`;

export async function recognizeDeckImage(dataUrl: string): Promise<WindowsOcrResult> {
  if (process.platform !== 'win32') throw new Error('Windows 文字识别不可用');
  if (typeof dataUrl !== 'string' || dataUrl.length > 36 * 1024 * 1024 || !/^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('无效卡组图片');
  const folder = await mkdtemp(path.join(tmpdir(), 'kards-deck-ocr-'));
  try {
    const imagePath = path.join(folder, 'deck.png');
    const input = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    await writeFile(imagePath, await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize(4096, 4096, { fit: 'inside', withoutEnlargement: true }).png().toBuffer());
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const output = await new Promise<string>((resolve, reject) => {
      execFile(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
        windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, KARDS_OCR_IMAGE: imagePath },
      }, (error, stdout) => error ? reject(error) : resolve(stdout));
    });
    return JSON.parse(output.replace(/^\uFEFF/, '').trim());
  } finally { await rm(folder, { recursive: true, force: true }); }
}
