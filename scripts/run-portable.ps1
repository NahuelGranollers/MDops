param(
  [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$env:MD_OPS_AUTO_OPEN = "1"
$env:MD_OPS_PORTABLE = "1"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"

$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("portable-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

Write-Host ("Log de arranque: " + $log)

$script = Join-Path $root "dev-lan.bat"
if (-not $SelfTest -and -not (Test-Path $script)) {
  throw "No encuentro dev-lan.bat en $root. Descomprime el ZIP completo antes de ejecutar MD-Ops-Portable.bat."
}

$exitCode = 1
$transcriptStarted = $false

try {
  Start-Transcript -Path $log -Force | Out-Null
  $transcriptStarted = $true

  if ($SelfTest) {
    Write-Host "portable-wrapper-ok"
    $exitCode = 0
  } else {
    $cmdLine = 'call "' + $script + '"'
    & $env:ComSpec "/d" "/c" $cmdLine
    if ($null -ne $LASTEXITCODE) {
      $exitCode = [int]$LASTEXITCODE
    } else {
      $exitCode = 0
    }
  }
} catch {
  Write-Host ("Error portable: " + $_.Exception.Message)
  $exitCode = 1
} finally {
  if ($transcriptStarted) {
    try {
      Stop-Transcript | Out-Null
    } catch {
      Write-Host ("No se ha podido cerrar el log: " + $_.Exception.Message)
    }
  }
}

exit $exitCode
