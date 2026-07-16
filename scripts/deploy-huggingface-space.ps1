param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$')]
    [string]$SpaceId,

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
$stageName = 'tomato-insight-hf-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$stagePath = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $stageName))

function Copy-ProjectItem {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $source = Join-Path $repoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Missing deployment file: $RelativePath"
    }

    $destination = Join-Path $stagePath $RelativePath
    $destinationParent = Split-Path -Parent $destination
    if ($destinationParent) {
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

try {
    Push-Location $repoRoot

    if (-not $DryRun) {
        & hf auth whoami | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw 'Run hf auth login with a write-enabled Hugging Face token first.'
        }
    }

    New-Item -ItemType Directory -Path $stagePath -Force | Out-Null

    $projectFiles = @(
        'app.py',
        'yolo26_detector.py',
        'requirements.txt',
        'Dockerfile',
        '.dockerignore'
    )

    foreach ($file in $projectFiles) {
        Copy-ProjectItem -RelativePath $file
    }

    foreach ($directory in @('models', 'templates', 'static')) {
        $sourceDirectory = Join-Path $repoRoot $directory
        $destinationDirectory = Join-Path $stagePath $directory
        Copy-Item -LiteralPath $sourceDirectory -Destination $destinationDirectory -Recurse -Force
    }

    $runtimePaths = @(
        (Join-Path $stagePath 'static\uploads'),
        (Join-Path $stagePath 'static\results')
    )
    foreach ($runtimePath in $runtimePaths) {
        New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
        Get-ChildItem -LiteralPath $runtimePath -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne '.gitkeep' } |
            Remove-Item -Recurse -Force
    }

    Copy-ProjectItem -RelativePath 'deploy\huggingface\README.md'
    Move-Item -LiteralPath (Join-Path $stagePath 'deploy\huggingface\README.md') `
        -Destination (Join-Path $stagePath 'README.md') -Force
    Remove-Item -LiteralPath (Join-Path $stagePath 'deploy') -Recurse -Force

    if ($DryRun) {
        $fileCount = (Get-ChildItem -LiteralPath $stagePath -Recurse -File).Count
        $totalBytes = (
            Get-ChildItem -LiteralPath $stagePath -Recurse -File |
                Measure-Object -Property Length -Sum
        ).Sum
        Write-Host "Dry run completed: $fileCount files, $([math]::Round($totalBytes / 1MB, 2)) MB"
        return
    }

    & hf repos create $SpaceId --type space --space-sdk docker --public --flavor cpu-basic --exist-ok
    if ($LASTEXITCODE -ne 0) {
        throw 'Space creation failed. Check the Space ID and token permissions.'
    }

    & hf upload $SpaceId $stagePath . --repo-type space --commit-message 'Deploy Tomato Insight'
    if ($LASTEXITCODE -ne 0) {
        throw 'Space upload failed. Check the network connection and token permissions.'
    }

    Write-Host ''
    Write-Host 'Deployment files uploaded. The Space build will start automatically:' -ForegroundColor Green
    Write-Host "https://huggingface.co/spaces/$SpaceId"
}
finally {
    Pop-Location -ErrorAction SilentlyContinue

    if (
        (Test-Path -LiteralPath $stagePath) -and
        $stagePath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
        ([System.IO.Path]::GetFileName($stagePath) -like 'tomato-insight-hf-*')
    ) {
        Remove-Item -LiteralPath $stagePath -Recurse -Force
    }
}
