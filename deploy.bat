@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

if "%*"=="" (
  set msg=deploy: %DATE% %TIME%
) else (
  set msg=%*
)

echo === MD Ops Deploy ===
echo.

echo [1/4] git add -A
git add -A
if errorlevel 1 goto error

echo [2/4] git commit -m "%msg%"
git commit -m "%msg%"
if errorlevel 1 (
  if errorlevel 128 goto error
  echo [!] Nada que commiter (no hay cambios nuevos^)
  goto done
)

echo [3/4] git push
git push
if errorlevel 1 goto error

echo [4/4] Despliegues iniciados.
echo.
echo === Seguimiento ===
echo Frontend: https://github.com/NahuelGranollers/MDops/actions
echo API:      https://vercel.com/nahuels-projects-b5553abb/m-dops-api
echo URL web:  https://nahuelgranollers.github.io/MDops/
goto done

:error
echo.
echo [!] Error detectado. Revisa la salida arriba.

:done
echo.
pause
