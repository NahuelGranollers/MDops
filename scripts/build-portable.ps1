param(
  [string]$OutputName = "md-ops-portable"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
$stage = Join-Path $dist $OutputName
$zip = Join-Path $dist "$OutputName.zip"

New-Item -ItemType Directory -Force -Path $dist | Out-Null

if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}

if (Test-Path $zip) {
  Remove-Item -LiteralPath $zip -Force
}

$excludeDirs = @(
  ".git",
  ".local-postgres",
  ".next",
  "dist",
  "logs",
  "node_modules",
  "uploads"
)

$excludeFiles = @(
  ".env",
  "*.err.log",
  "*.log",
  "*.tsbuildinfo"
)

$robocopyArgs = @(
  $root,
  $stage,
  "/E",
  "/XD"
) + $excludeDirs + @("/XF") + $excludeFiles + @(
  "/R:1",
  "/W:1",
  "/NFL",
  "/NDL",
  "/NJH",
  "/NJS",
  "/NP"
)

& robocopy @robocopyArgs | Out-Host
if ($LASTEXITCODE -gt 7) {
  throw "Robocopy fallo con codigo $LASTEXITCODE"
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force

Write-Host "Portable creado:"
Write-Host "  $zip"
Write-Host "Ejecuta MD-Ops-Portable.bat dentro del ZIP descomprimido para autoconfigurar y arrancar la app."
