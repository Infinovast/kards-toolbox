param(
    [string]$Executable = 'release/kards_toolbox.exe',
    [string]$CardsPack,
    [switch]$WithoutPack
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exe = (Resolve-Path -LiteralPath $Executable).Path
if (!$CardsPack -and !$WithoutPack) {
    $CardsPack = Join-Path (Split-Path -Parent $exe) 'cards.kpak'
    if (!(Test-Path -LiteralPath $CardsPack)) { $CardsPack = Join-Path $root 'release/cards.kpak' }
}
$pack = if ($WithoutPack) { $null } else { (Resolve-Path -LiteralPath $CardsPack).Path }
$output = (New-Item -ItemType Directory -Path (Join-Path $root 'test-results/wails') -Force).FullName
$work = (New-Item -ItemType Directory -Path (Join-Path $output ('smoke-' + [Guid]::NewGuid().ToString('N')))).FullName
$profile = Join-Path $work 'profile'
$testExe = Join-Path $work 'kards_toolbox.exe'
$testPack = Join-Path $work 'cards.kpak'
$process = $null
$oldDataDir = $env:KARDS_USER_DATA_DIR

function Get-PackHash([string]$File) {
    $stream = [IO.File]::OpenRead($File)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash($stream)) }
    finally { $sha.Dispose(); $stream.Dispose() }
}

try {
    Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
    Copy-Item -LiteralPath $exe -Destination $testExe
    if ($pack) {
        Copy-Item -LiteralPath $pack -Destination $testPack
        $sourceHash = Get-PackHash $pack
    }
    $env:KARDS_USER_DATA_DIR = $profile
    $process = Start-Process -FilePath $testExe -WorkingDirectory $work -PassThru -WindowStyle Normal
    $markerPath = Join-Path $profile 'full-cache-applied.json'
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $window = $null
    $ready = $false
    do {
        $process.Refresh()
        if ($process.HasExited) { throw "Wails exited with $($process.ExitCode)." }
        if ($process.MainWindowHandle -ne 0) {
            $window = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            if ($pack) {
                $ready = Test-Path -LiteralPath $markerPath
            } else {
                $descendants = $window.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
                $ready = @($descendants | Where-Object { $_.Current.Name -like 'KARDS *' }).Count -gt 0
            }
            if ($ready) { break }
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    if (!$ready) { throw 'The WebView2 window did not finish starting.' }
    if ($window.Current.Name -ne 'KARDS Toolbox') { throw "Unexpected window title: $($window.Current.Name)" }
    if (!$pack) {
        if (Test-Path -LiteralPath $markerPath) { throw 'An unexpected cache pack was installed.' }
        Write-Output 'Wails smoke passed: real WebView2 window without a distribution cache.'
        return
    }
    $marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    if ($marker.version -ne 1 -or $null -eq $marker.packs -or @($marker.packs.PSObject.Properties).Count -ne 1) {
        throw 'Invalid applied pack marker.'
    }
    if ((Get-PackHash (Join-Path $profile 'packs/cards.kpak')) -ne $sourceHash) {
        throw 'The new profile did not receive a byte-identical card image pack.'
    }
    if ((Get-PackHash $testPack) -ne $sourceHash -or (Get-PackHash $pack) -ne $sourceHash) {
        throw 'The original card image pack changed.'
    }
    Write-Output 'Wails smoke passed: real WebView2 window and byte-identical card image pack installed in a fresh profile.'
} finally {
    $env:KARDS_USER_DATA_DIR = $oldDataDir
    if ($process -and !$process.HasExited) {
        [void]$process.CloseMainWindow()
        if (!$process.WaitForExit(5000)) { $process.Kill(); $process.WaitForExit() }
    }
    if ((Split-Path -Parent (Resolve-Path -LiteralPath $work).Path) -eq (Resolve-Path -LiteralPath $output).Path) {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
