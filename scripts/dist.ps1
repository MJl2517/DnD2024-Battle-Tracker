param(
  [ValidateSet("", "always", "onTag", "onTagOrDraft", "never")]
  [string]$Publish = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

$CacheRoot = Join-Path $ProjectRoot ".electron-builder-cache"
$WinCodeSignName = "winCodeSign-2.6.0"
$WinCodeSignCache = Join-Path (Join-Path $CacheRoot "winCodeSign") $WinCodeSignName
$DownloadCache = Join-Path $CacheRoot "downloads"
$SevenZip = Join-Path $ProjectRoot "node_modules\7zip-bin\win\x64\7za.exe"

function Test-InsideDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Child,
    [Parameter(Mandatory = $true)][string]$Parent
  )

  $childFull = [System.IO.Path]::GetFullPath($Child)
  $parentFull = [System.IO.Path]::GetFullPath($Parent)
  return $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)
}

function Remove-LocalCacheDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-InsideDirectory -Child $Path -Parent $CacheRoot)) {
    throw "Refusing to remove a path outside local electron-builder cache: $Path"
  }

  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Test-WinCodeSignReady {
  param([Parameter(Mandatory = $true)][string]$Path)

  return (
    (Test-Path -LiteralPath (Join-Path $Path "rcedit-x64.exe")) -and
    (Test-Path -LiteralPath (Join-Path $Path "windows-10\x64\signtool.exe"))
  )
}

function Get-WinCodeSignArchive {
  New-Item -ItemType Directory -Force -Path $DownloadCache | Out-Null

  $archive = Join-Path $DownloadCache "$WinCodeSignName.7z"
  if (Test-Path -LiteralPath $archive) {
    return $archive
  }

  $globalCache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
  if (Test-Path -LiteralPath $globalCache) {
    $existingArchive = Get-ChildItem -LiteralPath $globalCache -Filter "*.7z" -File |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1

    if ($existingArchive) {
      Copy-Item -LiteralPath $existingArchive.FullName -Destination $archive -Force
      return $archive
    }
  }

  $url = "https://github.com/electron-userland/electron-builder-binaries/releases/download/$WinCodeSignName/$WinCodeSignName.7z"
  Write-Host "Downloading $WinCodeSignName..."
  Invoke-WebRequest -Uri $url -OutFile $archive
  return $archive
}

function Ensure-WinCodeSignCache {
  if (Test-WinCodeSignReady -Path $WinCodeSignCache) {
    return
  }

  if (-not (Test-Path -LiteralPath $SevenZip)) {
    throw "7za.exe was not found. Run npm.cmd install first."
  }

  New-Item -ItemType Directory -Force -Path (Split-Path $WinCodeSignCache -Parent) | Out-Null
  Remove-LocalCacheDirectory -Path $WinCodeSignCache
  New-Item -ItemType Directory -Force -Path $WinCodeSignCache | Out-Null

  $archive = Get-WinCodeSignArchive
  Write-Host "Preparing local $WinCodeSignName cache..."
  & $SevenZip x -bd -y $archive "-o$WinCodeSignCache" | Out-Host
  $extractExitCode = $LASTEXITCODE

  if ($extractExitCode -ne 0 -and -not (Test-WinCodeSignReady -Path $WinCodeSignCache)) {
    throw "Failed to extract $WinCodeSignName. Exit code: $extractExitCode"
  }

  if ($extractExitCode -ne 0) {
    Write-Warning "7-Zip could not create macOS symlinks from $WinCodeSignName. Windows tools were extracted, so the build can continue."
  }
}

if (-not $SkipBuild) {
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
Ensure-WinCodeSignCache

$env:ELECTRON_BUILDER_CACHE = $CacheRoot
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

$builderArgs = @()
if ($Publish) {
  $builderArgs += "--publish"
  $builderArgs += $Publish
}

& (Join-Path $ProjectRoot "node_modules\.bin\electron-builder.cmd") @builderArgs
exit $LASTEXITCODE
