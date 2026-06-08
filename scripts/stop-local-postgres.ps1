$ErrorActionPreference = "Stop"

$pgctl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$data = Join-Path $root ".local-postgres"

if (Test-Path $data) {
  & $pgctl -D $data stop
}
