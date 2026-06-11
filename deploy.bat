@echo off
setlocal enabledelayedexpansion

if "%1"=="" (
  set msg=deploy: %DATE% %TIME%
) else (
  set msg=%*
)

echo ^> git add -A
git add -A

echo ^> git commit -m "%msg%"
git commit -m "%msg%"

echo ^> git push
git push

echo.
echo Hecho. Esperando a GitHub Actions y Vercel...
echo Frontend: https://github.com/NahuelGranollers/MDops/actions
echo API:      https://vercel.com/nahuels-projects-b5553abb/m-dops-api
