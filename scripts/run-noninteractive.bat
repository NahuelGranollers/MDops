@echo off
REM Wrapper to run push-and-deploy in non-interactive mode and set defaults
set "MDO_NONINTERACTIVE=1"
set "MDO_API_URL=https://m-dops-api.vercel.app"
call "%~dp0\..\push-and-deploy.bat" /y
