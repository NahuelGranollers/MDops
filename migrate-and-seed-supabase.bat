@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title MD Ops - Migrar y Seed Supabase

echo.
echo == MD Ops: migrar y seed Supabase ==
echo Proyecto: https://uvkkmqxnxpnnffxwevuw.supabase.co
echo.
echo IMPORTANTE:
echo Usa la connection string de Supabase "Session pooler", puerto 5432.
echo Formato parecido:
echo postgres://postgres.uvkkmqxnxpnnffxwevuw:[PASSWORD]@aws-REGION.pooler.supabase.com:5432/postgres
echo.
echo No uses db.uvkkmqxnxpnnffxwevuw.supabase.co:5432 si tu red no soporta IPv6.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: node no esta disponible en PATH.
  goto :error
)

where corepack >nul 2>nul
if errorlevel 1 (
  echo AVISO: corepack no esta disponible en PATH. Se usara npx/npm.
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm no esta disponible en PATH.
  goto :error
)

where npx >nul 2>nul
if errorlevel 1 (
  echo ERROR: npx no esta disponible en PATH.
  goto :error
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$databaseUrl=Read-Host 'Pega DATABASE_URL Session pooler completa';" ^
  "if (-not $databaseUrl) { throw 'DATABASE_URL vacia.' };" ^
  "if ($databaseUrl -match 'db\.uvkkmqxnxpnnffxwevuw\.supabase\.co:5432') { Write-Host ''; Write-Host 'AVISO: has pegado la URL directa IPv6. Si vuelve a salir P1001, copia la Session pooler desde Supabase > Connect.'; Write-Host '' };" ^
  "if ($databaseUrl -notmatch '\?') { $databaseUrl += '?sslmode=require' } elseif ($databaseUrl -notmatch 'sslmode=') { $databaseUrl += '&sslmode=require' };" ^
  "$env:DATABASE_URL=$databaseUrl;" ^
  "$tools=Join-Path (Get-Location) '.mdops-cloud-tools';" ^
  "New-Item -ItemType Directory -Force -Path $tools | Out-Null;" ^
  "if (-not (Test-Path (Join-Path $tools 'package.json'))) { [pscustomobject]@{ private = $true } | ConvertTo-Json -Compress | Set-Content -Encoding ASCII (Join-Path $tools 'package.json') };" ^
  "Write-Host 'Instalando herramientas temporales...'; npm install --prefix $tools --silent --no-save pg@8.13.1 bcryptjs@3.0.2;" ^
  "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };" ^
  "Write-Host 'Ejecutando migraciones Prisma...'; & 'C:\Program Files\nodejs\npx.cmd' --yes prisma@6.7.0 migrate deploy --schema apps/api/prisma/schema.prisma;" ^
  "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };" ^
  "Write-Host 'Ejecutando seed minimo...'; node scripts/seed-supabase.cjs $tools;" ^
  "exit $LASTEXITCODE"

if errorlevel 1 goto :error

echo.
echo == Listo ==
echo Supabase deberia tener las tablas y usuarios iniciales.
echo Usuario: admin
echo Password: 2001
echo.
pause
exit /b 0

:error
echo.
echo El proceso se ha detenido por un error.
echo Revisa el mensaje anterior.
echo.
pause
exit /b 1
