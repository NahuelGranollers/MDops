@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
title MD Ops - Push y Deploy

echo.
echo == MD Ops: push + deploy ==
echo Repo: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: git no esta disponible en PATH.
  echo Instala Git for Windows o abre este .bat desde una consola donde git funcione.
  goto :error
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: node no esta disponible en PATH.
  goto :error
)

where npx >nul 2>nul
if errorlevel 1 (
  echo ERROR: npx no esta disponible en PATH.
  goto :error
)

set "SAFE_DIR=%CD:\=/%"
set "GIT_SAFE=git -c safe.directory=%SAFE_DIR%"

%GIT_SAFE% rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo ERROR: esta carpeta no parece ser un repositorio Git valido.
  echo Carpeta actual: %CD%
  goto :error
)

set "CURRENT_BRANCH="
for /f "delims=" %%b in ('%GIT_SAFE% branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%b"
if "%CURRENT_BRANCH%"=="" (
  for /f "delims=" %%b in ('%GIT_SAFE% rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT_BRANCH=%%b"
)

set "PUSH_TARGET=main"
if "%CURRENT_BRANCH%"=="" (
  echo AVISO: no se ha podido detectar la rama actual.
  echo Se puede continuar enviando el commit actual a origin/main.
  set /p "CONTINUE_HEAD=Continuar con push HEAD:main? (s/N): "
  if /i not "!CONTINUE_HEAD!"=="s" if /i not "!CONTINUE_HEAD!"=="si" if /i not "!CONTINUE_HEAD!"=="y" if /i not "!CONTINUE_HEAD!"=="yes" goto :error
  set "PUSH_TARGET=HEAD:main"
) else if /i not "%CURRENT_BRANCH%"=="main" (
  echo ERROR: estas en la rama "%CURRENT_BRANCH%", no en "main".
  echo Cambia a main antes de desplegar:
  echo   git switch main
  goto :error
)

set "GIT_USER_NAME="
set "GIT_USER_EMAIL="
for /f "delims=" %%n in ('%GIT_SAFE% config user.name 2^>nul') do set "GIT_USER_NAME=%%n"
for /f "delims=" %%e in ('%GIT_SAFE% config user.email 2^>nul') do set "GIT_USER_EMAIL=%%e"

if "%GIT_USER_NAME%"=="" (
  echo.
  set /p "GIT_USER_NAME=Nombre para los commits: "
  if "!GIT_USER_NAME!"=="" goto :error
  %GIT_SAFE% config user.name "!GIT_USER_NAME!"
  if errorlevel 1 goto :error
)

if "%GIT_USER_EMAIL%"=="" (
  echo.
  set /p "GIT_USER_EMAIL=Email para los commits: "
  if "!GIT_USER_EMAIL!"=="" goto :error
  %GIT_SAFE% config user.email "!GIT_USER_EMAIL!"
  if errorlevel 1 goto :error
)

set "COMMIT_MSG="
set /p "COMMIT_MSG=Mensaje de commit [deploy update]: "
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=deploy update"

echo.
echo == Estado actual ==
%GIT_SAFE% status --short
if errorlevel 1 goto :error

echo.
echo == Preparando commit ==
%GIT_SAFE% add -A
if errorlevel 1 goto :error

%GIT_SAFE% diff --cached --quiet
if errorlevel 1 (
  %GIT_SAFE% commit -m "%COMMIT_MSG%"
  if errorlevel 1 goto :error
) else (
  echo No hay cambios para commitear. Se continua con push/deploy.
)

echo.
echo == Push a origin/%PUSH_TARGET% ==
%GIT_SAFE% push origin %PUSH_TARGET%
if errorlevel 1 goto :error

echo.
echo GitHub Pages se desplegara automaticamente con GitHub Actions.
echo URL: https://nahuelgranollers.github.io/MDops/

echo.
echo == Deploy Vercel production ==
call npx --yes vercel@latest --prod
if errorlevel 1 (
  echo.
  echo ERROR: fallo el deploy de Vercel.
  echo Si es la primera vez, ejecuta antes:
  echo   npx vercel login
  echo   npx vercel link
  goto :error
)

echo.
echo == Listo ==
echo Frontend: https://nahuelgranollers.github.io/MDops/
echo API: https://m-dops-api.vercel.app
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
