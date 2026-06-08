@echo off
setlocal

cd /d "%~dp0"

if not exist logs mkdir logs >nul 2>nul
set "MD_OPS_AUTO_OPEN=1"
set "MD_OPS_PORTABLE=1"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"

echo.
echo ========================================
echo  MD Ops Portable
echo ========================================
echo.
echo Se preparara Node/pnpm/Docker/PostgreSQL si faltan y se arrancara como servidor local.
echo La instalacion de Docker o WSL puede requerir permisos de administrador o reinicio de Windows.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-portable.ps1
set "MD_OPS_EXIT=%ERRORLEVEL%"

echo.
if "%MD_OPS_EXIT%"=="0" (
  echo MD Ops Portable ha terminado.
) else (
  echo MD Ops Portable se ha detenido con error %MD_OPS_EXIT%.
  echo Revisa el ultimo archivo logs\portable-*.log para ver el motivo.
)
echo.
pause

endlocal
