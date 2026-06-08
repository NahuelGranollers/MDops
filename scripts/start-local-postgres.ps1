$ErrorActionPreference = "Stop"

$pgBin = @(
  "C:\Program Files\PostgreSQL\18\bin",
  "C:\Program Files\PostgreSQL\17\bin",
  "C:\Program Files\PostgreSQL\16\bin"
) | Where-Object { Test-Path (Join-Path $_ "initdb.exe") } | Select-Object -First 1

if (-not $pgBin) {
  throw "No encuentro PostgreSQL 16, 17 o 18 en C:\Program Files\PostgreSQL"
}

$initdb = Join-Path $pgBin "initdb.exe"
$pgctl = Join-Path $pgBin "pg_ctl.exe"
$createdb = Join-Path $pgBin "createdb.exe"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$data = Join-Path $root ".local-postgres"

if (!(Test-Path $initdb)) {
  throw "No encuentro PostgreSQL en $pgBin"
}

if (!(Test-Path $data)) {
  & $initdb -D $data -U md_ops --auth=trust --encoding=UTF8 --locale=C
}

& $pgctl -D $data -o "-p 55432" -l (Join-Path $data "postgres.log") start
Start-Sleep -Seconds 2
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$createdbOutput = & $createdb -h localhost -p 55432 -U md_ops md_ops 2>&1
$createdbExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($createdbExitCode -ne 0) {
  if (($createdbOutput | Out-String) -match "already exists|ya existe") {
    Write-Host "La base md_ops ya existe o no necesita crearse."
  } else {
    $createdbOutput | Write-Error
    exit $createdbExitCode
  }
}

Write-Host "PostgreSQL local disponible en localhost:55432, base md_ops, usuario md_ops."
