param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\dist")
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distRoot = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
    [System.IO.Path]::GetFullPath($OutputDirectory)
}
else {
    [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
}
$packageRoot = Join-Path $distRoot "Tomato-Insight-Windows"
$zipPath = Join-Path $distRoot "Tomato-Insight-Windows.zip"
$launcherPath = Join-Path $projectRoot "TomatoInsightLauncher.exe"

$resolvedPackageRoot = [System.IO.Path]::GetFullPath($packageRoot)
$resolvedDistRoot = [System.IO.Path]::GetFullPath($distRoot).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar
)
if (-not $resolvedPackageRoot.StartsWith(
    $resolvedDistRoot + [System.IO.Path]::DirectorySeparatorChar,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    throw "The package path is outside the selected dist directory."
}

& (Join-Path $PSScriptRoot "build-windows-launcher.ps1") `
    -OutputPath $launcherPath

if (Test-Path -LiteralPath $packageRoot) {
    Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

$files = @(
    "app.py",
    "yolo26_detector.py",
    "requirements.txt",
    "README.md",
    "TomatoInsightLauncher.exe",
    "launcher\LOCAL_RUN_README.txt"
)

foreach ($file in $files) {
    $destinationName = Split-Path -Leaf $file
    Copy-Item `
        -LiteralPath (Join-Path $projectRoot $file) `
        -Destination (Join-Path $packageRoot $destinationName) `
        -Force
}

$directories = @(
    "models",
    "templates",
    "static\css",
    "static\js",
    "static\assets",
    "static\images",
    "static\demos"
)

foreach ($directory in $directories) {
    $source = Join-Path $projectRoot $directory
    $destination = Join-Path $packageRoot $directory
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) |
        Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

New-Item -ItemType Directory -Force `
    -Path (Join-Path $packageRoot "static\uploads") |
    Out-Null
New-Item -ItemType Directory -Force `
    -Path (Join-Path $packageRoot "static\results") |
    Out-Null

$modelFiles = @(
    (Join-Path $packageRoot "models\leaf\best.onnx"),
    (Join-Path $packageRoot "models\fruit\best.onnx")
)

foreach ($modelFile in $modelFiles) {
    if (-not (Test-Path -LiteralPath $modelFile)) {
        throw "Model file is missing: $modelFile"
    }
    if ((Get-Item -LiteralPath $modelFile).Length -lt 1MB) {
        throw "Model file is not a complete ONNX file: $modelFile"
    }
}

Compress-Archive `
    -LiteralPath $packageRoot `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

$sizeMB = [math]::Round(
    (Get-Item -LiteralPath $zipPath).Length / 1MB,
    2
)

Write-Host "Windows package built: $zipPath ($sizeMB MB)"
