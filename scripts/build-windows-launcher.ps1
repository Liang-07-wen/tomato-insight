param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\TomatoInsightLauncher.exe")
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sourcePath = Join-Path $projectRoot "launcher\TomatoInsightLauncher.cs"
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    [System.IO.Path]::GetFullPath($OutputPath)
}
else {
    [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputPath))
}

$compilerCandidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

$compiler = $compilerCandidates |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

if (-not $compiler) {
    throw "Windows .NET Framework C# compiler was not found."
}

$outputDirectory = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

& $compiler `
    "/nologo" `
    "/target:exe" `
    "/optimize+" `
    "/platform:anycpu" `
    "/codepage:65001" `
    "/out:$resolvedOutput" `
    $sourcePath

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $resolvedOutput)) {
    throw "Windows launcher build failed."
}

Write-Host "Windows launcher built: $resolvedOutput"
