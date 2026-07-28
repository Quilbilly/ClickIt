# Build the Windows x64 Sony CrSDK bridge.
# Requires: Visual Studio 2022 Build Tools (or VS) + CMake + SDK under
#   vendor/sony-camera-remote-sdk/windows
# Optional: $env:SONY_SDK_ROOT = 'D:\path\to\sdk'

$ErrorActionPreference = "Stop"

$NativeRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $NativeRoot "..\..\..")).Path
$BuildDir = Join-Path $NativeRoot "build"
$DistDir = Join-Path $NativeRoot "dist"

if (-not $env:SONY_SDK_ROOT) {
  $env:SONY_SDK_ROOT = Join-Path $RepoRoot "vendor\sony-camera-remote-sdk\windows"
}

Write-Host "SONY_SDK_ROOT=$($env:SONY_SDK_ROOT)"
if (-not (Test-Path $env:SONY_SDK_ROOT)) {
  throw "Sony SDK not found at $($env:SONY_SDK_ROOT). Extract the Windows x64 Camera Remote SDK there first."
}

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

cmake -S $NativeRoot -B $BuildDir -G "Visual Studio 17 2022" -A x64 -DSonyCrSDK_ROOT="$($env:SONY_SDK_ROOT)"
if ($LASTEXITCODE -ne 0) {
  # Fall back to whatever default generator CMake picks (Ninja / older VS).
  cmake -S $NativeRoot -B $BuildDir -A x64 -DSonyCrSDK_ROOT="$($env:SONY_SDK_ROOT)"
  if ($LASTEXITCODE -ne 0) { throw "cmake configure failed" }
}

cmake --build $BuildDir --config Release
if ($LASTEXITCODE -ne 0) { throw "cmake build failed" }

$exe = Join-Path $DistDir "clickit-sony-bridge.exe"
if (-not (Test-Path $exe)) {
  throw "Expected output missing: $exe"
}

Write-Host ""
Write-Host "Built $exe"
Write-Host "Run: npm run sony-bridge"
Write-Host "Or:  `$env:CAMERA_PROVIDER='sony'; npm run dev:sony"
