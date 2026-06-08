@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

if not exist logs mkdir logs >nul 2>nul
if not exist uploads mkdir uploads >nul 2>nul
set "MD_OPS_ROOT=%CD%"
set "SESSION_LOG_DIR=%MD_OPS_ROOT%\logs"
set "UPLOAD_DIR=%MD_OPS_ROOT%\uploads"
set "INTERNAL_API_URL=http://127.0.0.1:4000"
set "NEXT_PUBLIC_API_URL=/api"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
set "POSTGRES_PRIMARY_IMAGE=postgres:16-alpine"
set "POSTGRES_MIRROR_IMAGE=public.ecr.aws/docker/library/postgres:16-alpine"

echo.
echo ========================================
echo  MD Ops - desarrollo en red local
echo ========================================
echo.

set "LAN_IP="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object { $_ -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' } | Select-Object -First 1"`) do (
  set "LAN_IP=%%A"
)

if not defined LAN_IP (
  for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "CANDIDATE=%%A"
    set "CANDIDATE=!CANDIDATE: =!"
    echo !CANDIDATE! | findstr /r "^127\." >nul
    if errorlevel 1 (
      echo !CANDIDATE! | findstr /r "^169\.254\." >nul
      if errorlevel 1 if not defined LAN_IP set "LAN_IP=!CANDIDATE!"
    )
  )
)

if not defined LAN_IP (
  echo No he podido detectar una IP de red local.
  echo Abre desde este equipo: http://localhost:3000
) else (
  echo Abre desde este equipo:
  echo   http://localhost:3000
  echo.
  echo Abre desde otro dispositivo en la misma WiFi/red:
  echo   http://!LAN_IP!:3000
  echo.
  echo No uses http://0.0.0.0:3000 en el movil.
  echo Usa esta URL:
  echo   http://!LAN_IP!:3000
)

set "PUBLIC_APP_URL=http://localhost:3000"
set "CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000"
if defined LAN_IP set "CORS_ORIGIN=!CORS_ORIGIN!,http://!LAN_IP!:3000"

echo.
echo API local:
echo   http://localhost:4000/health
if defined LAN_IP echo   http://!LAN_IP!:4000/health
echo.
echo Logs de sesion:
echo   !SESSION_LOG_DIR!
echo.
echo Si Windows pregunta por firewall, permite Node.js en redes privadas.
echo Si el movil no entra, revisa que Windows Firewall permita Node.js o el puerto 3000 en red privada.
echo Para cerrar la app: Ctrl + C
echo.

call :detectPackageManager
if errorlevel 1 (
  echo.
  echo No encuentro pnpm ni Corepack. Intento prepararlo automaticamente...
  echo.
  call :installToolchain
  if errorlevel 1 (
    echo.
    echo No he podido preparar Node.js/pnpm automaticamente.
    echo Instala Node.js 22 o superior desde https://nodejs.org/ y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
  )

  call :detectPackageManager
  if errorlevel 1 (
    echo.
    echo Node.js parece instalado, pero pnpm/Corepack aun no estan disponibles.
    echo Cierra esta ventana, abre una terminal nueva y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
  )
)
echo Usando !PNPM_LABEL!.
echo.

if not exist .env (
  if exist .env.example (
    echo No hay .env. Creando configuracion local desde .env.example...
    copy /y .env.example .env >nul
  ) else (
    echo No encuentro .env ni .env.example.
    pause
    exit /b 1
  )
)

call :syncDatabaseUrl
if errorlevel 1 (
  echo.
  echo No he podido ajustar DATABASE_URL en .env.
  echo Revisa que el archivo .env no este abierto o bloqueado por otro programa.
  echo.
  pause
  exit /b 1
)

call :preferPostgresMirror
if errorlevel 1 (
  echo.
  echo No he podido ajustar POSTGRES_IMAGE en .env.
  echo Revisa que el archivo .env no este abierto o bloqueado por otro programa.
  echo.
  pause
  exit /b 1
)

set "DB_PORT=55432"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$line = Get-Content '.env' -ErrorAction SilentlyContinue | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1; if ($line -and $line -match 'localhost:(\d+)') { $Matches[1] } else { '55432' }"`) do (
  set "DB_PORT=%%A"
)

echo Comprobando PostgreSQL de MD Ops en localhost:!DB_PORT!...
call :waitForPort !DB_PORT! 1
if errorlevel 1 (
  echo PostgreSQL no esta arrancado. Intentando arrancarlo con Docker...
  call :ensureDocker
  if defined DOCKER_RELAUNCHED (
    echo Continua en la ventana de administrador que se acaba de abrir.
    exit /b 0
  )
  if defined WSL_RESTART_REQUIRED (
    echo.
    echo WSL se ha preparado, pero Windows necesita reiniciarse antes de continuar.
    echo Reinicia Windows y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
  )
  if errorlevel 1 (
    echo.
    echo Docker Desktop no esta listo.
    echo Si se acaba de instalar, reinicia Windows y vuelve a ejecutar este archivo.
    echo Si no se ha instalado, abre Docker Desktop manualmente y espera a que termine de arrancar.
    echo Si prefieres no usar Docker, instala PostgreSQL y deja DATABASE_URL apuntando a esa base.
    echo.
    pause
    exit /b 1
  )

  call :startDockerPostgres
  if errorlevel 1 (
    echo.
    echo Docker no ha podido arrancar PostgreSQL. Intentando usar PostgreSQL local si esta instalado...
    call :startLocalPostgresIfAvailable
    if errorlevel 1 (
      echo PostgreSQL local no esta instalado o no esta disponible. Intentando instalar PostgreSQL 18 con winget...
      call :installLocalPostgres
      if defined POSTGRES_RELAUNCHED (
        echo Continua en la ventana de administrador que se acaba de abrir.
        exit /b 0
      )
      if not errorlevel 1 call :startLocalPostgresIfAvailable
    )
    if errorlevel 1 (
      echo.
      echo No he podido arrancar PostgreSQL.
      echo Se ha probado Docker con mirror publico y Docker Hub, PostgreSQL local y la instalacion con winget.
      echo Abre Docker Desktop y vuelve a ejecutar este archivo, o instala PostgreSQL 16 o superior y vuelve a intentarlo.
      echo.
      pause
      exit /b 1
    )
  )

  echo Esperando a que PostgreSQL acepte conexiones...
  call :waitForPort !DB_PORT! 30
  if errorlevel 1 (
    echo.
    echo PostgreSQL no ha respondido en localhost:!DB_PORT!.
    echo Revisa Docker Desktop y que el puerto !DB_PORT! no este bloqueado.
    echo.
    pause
    exit /b 1
  )
)

echo PostgreSQL listo en localhost:!DB_PORT!.
echo.

set "INSTALL_ARGS="
if not exist node_modules set "INSTALL_ARGS=install"
if not exist apps\api\node_modules\prisma\build\index.js set "INSTALL_ARGS=install --force"
if not exist apps\web\node_modules\next\package.json set "INSTALL_ARGS=install --force"
if not exist packages\shared\node_modules\typescript\bin\tsc set "INSTALL_ARGS=install --force"

if defined INSTALL_ARGS (
  echo Instalando dependencias...
  if "!INSTALL_ARGS!"=="install --force" (
    echo La instalacion parecia incompleta; limpiare la cache de pnpm y reconstruire node_modules.
    call !PNPM_CMD! store prune
  )
  call !PNPM_CMD! !INSTALL_ARGS!
  if errorlevel 1 (
    echo.
    echo No se han podido instalar las dependencias.
    pause
    exit /b 1
  )
  echo.
)

echo Cerrando servidores antiguos de MD Ops, si los hay...
call :stopOldMdOps
echo.

if not exist apps\api\node_modules\prisma\build\index.js (
  echo Prisma CLI esta incompleto tras cerrar procesos. Reconstruyendo dependencias...
  call !PNPM_CMD! store prune
  call !PNPM_CMD! install --force
  if errorlevel 1 (
    echo.
    echo No se han podido reconstruir las dependencias.
    pause
    exit /b 1
  )
  echo.
)

echo Preparando Prisma...
echo.
call :cleanPrismaClient
call !PNPM_CMD! db:generate
if errorlevel 1 (
  echo.
  echo Prisma ha encontrado un archivo bloqueado. Cierro procesos y reintento...
  call :stopOldMdOps
  if not exist apps\api\node_modules\prisma\build\index.js (
    echo Prisma CLI esta incompleto. Reconstruyendo dependencias...
    call !PNPM_CMD! store prune
    call !PNPM_CMD! install --force
    if errorlevel 1 (
      echo.
      echo No se han podido reconstruir las dependencias.
      pause
      exit /b 1
    )
  )
  call :cleanPrismaClient
  timeout /t 2 /nobreak >nul
  call !PNPM_CMD! db:generate
  if errorlevel 1 (
    echo.
    echo No se ha podido generar Prisma.
    echo Si hay un antivirus bloqueando query_engine-windows.dll.node, permitelo y vuelve a ejecutar este archivo.
    pause
    exit /b 1
  )
)

call !PNPM_CMD! db:dev
if errorlevel 1 (
  echo.
  echo No se ha podido conectar o migrar la base de datos.
  echo Asegurate de que PostgreSQL esta arrancado y que DATABASE_URL apunta al puerto !DB_PORT!.
  echo.
  echo Revisa el valor DATABASE_URL en .env:
  echo   localhost:!DB_PORT!
  echo.
  pause
  exit /b 1
)

call !PNPM_CMD! db:seed
if errorlevel 1 (
  echo.
  echo No se ha podido cargar el seed inicial.
  echo Revisa el error anterior y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

echo.
echo Arrancando backend y frontend...
echo.
echo Backend:
echo   http://localhost:4000
if defined LAN_IP echo   http://!LAN_IP!:4000
echo.
echo Frontend:
echo   http://localhost:3000
if defined LAN_IP echo   http://!LAN_IP!:3000
echo.

if /i "%MD_OPS_AUTO_OPEN%"=="1" (
  if defined LAN_IP (
    start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 18; Start-Process 'http://!LAN_IP!:3000'"
    echo En unos segundos se abrira:
    echo   App:     http://!LAN_IP!:3000
  ) else (
    start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 18; Start-Process 'http://localhost:3000'"
  )
)

call !PNPM_CMD! dev

endlocal
goto :eof

:detectPackageManager
set "PNPM_CMD="
set "PNPM_LABEL="

call :refreshToolchainPath

where pnpm >nul 2>nul
if not errorlevel 1 (
  set "PNPM_CMD=pnpm"
  set "PNPM_LABEL=pnpm"
  exit /b 0
)

if exist "%AppData%\npm\pnpm.cmd" (
  set "PNPM_CMD="%AppData%\npm\pnpm.cmd""
  set "PNPM_LABEL=pnpm desde %AppData%\npm"
  exit /b 0
)

if exist "%ProgramFiles%\nodejs\pnpm.cmd" (
  set "PNPM_CMD="%ProgramFiles%\nodejs\pnpm.cmd""
  set "PNPM_LABEL=pnpm desde %ProgramFiles%\nodejs"
  exit /b 0
)

where corepack >nul 2>nul
if not errorlevel 1 (
  set "PNPM_CMD=corepack pnpm"
  set "PNPM_LABEL=Corepack"
  exit /b 0
)

if exist "%ProgramFiles%\nodejs\corepack.cmd" (
  set "PNPM_CMD="%ProgramFiles%\nodejs\corepack.cmd" pnpm"
  set "PNPM_LABEL=Corepack desde %ProgramFiles%\nodejs"
  exit /b 0
)

exit /b 1

:installToolchain
call :refreshToolchainPath

set "NEED_NODE_INSTALL="
set "HAS_NPM="
set "HAS_COREPACK="

where node >nul 2>nul
if errorlevel 1 set "NEED_NODE_INSTALL=1"

where npm >nul 2>nul
if not errorlevel 1 set "HAS_NPM=1"
where corepack >nul 2>nul
if not errorlevel 1 set "HAS_COREPACK=1"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "HAS_NPM=1"
if exist "%ProgramFiles%\nodejs\corepack.cmd" set "HAS_COREPACK=1"

if not defined NEED_NODE_INSTALL if not defined HAS_NPM if not defined HAS_COREPACK set "NEED_NODE_INSTALL=1"

if defined NEED_NODE_INSTALL (
  echo Node.js/npm/Corepack no estan disponibles. Intentando instalar Node.js LTS con winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo winget no esta disponible en este Windows.
    exit /b 1
  )

  winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo winget no ha podido instalar Node.js.
    exit /b 1
  )
)

call :refreshToolchainPath

where corepack >nul 2>nul
if not errorlevel 1 (
  echo Activando pnpm 9.15.4 con Corepack...
  call corepack prepare pnpm@9.15.4 --activate
  if not errorlevel 1 exit /b 0
  echo Corepack no ha podido activar pnpm; probare con npm.
)

if exist "%ProgramFiles%\nodejs\corepack.cmd" (
  echo Activando pnpm 9.15.4 con Corepack...
  call "%ProgramFiles%\nodejs\corepack.cmd" prepare pnpm@9.15.4 --activate
  if not errorlevel 1 exit /b 0
  echo Corepack no ha podido activar pnpm; probare con npm.
)

where npm >nul 2>nul
if not errorlevel 1 (
  echo Instalando pnpm 9.15.4 con npm...
  if not exist "%AppData%\npm" mkdir "%AppData%\npm" >nul 2>nul
  call npm install --global pnpm@9.15.4 --prefix "%AppData%\npm"
  if errorlevel 1 exit /b 1
  call :refreshToolchainPath
  exit /b 0
)

if exist "%ProgramFiles%\nodejs\npm.cmd" (
  echo Instalando pnpm 9.15.4 con npm...
  if not exist "%AppData%\npm" mkdir "%AppData%\npm" >nul 2>nul
  call "%ProgramFiles%\nodejs\npm.cmd" install --global pnpm@9.15.4 --prefix "%AppData%\npm"
  if errorlevel 1 exit /b 1
  call :refreshToolchainPath
  exit /b 0
)

echo npm no esta disponible para instalar pnpm.
exit /b 1

:refreshToolchainPath
if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
if exist "%AppData%\npm" set "PATH=%AppData%\npm;%PATH%"
exit /b 0

:syncDatabaseUrl
powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = '.env'; if (-not (Test-Path $path)) { exit 0 }; $lines = Get-Content $path; $postgresPort = '55432'; foreach ($line in $lines) { if ($line -match '^POSTGRES_PORT=(\d+)') { $postgresPort = $Matches[1]; break } }; $changed = $false; $updated = foreach ($line in $lines) { if ($line -match '^(DATABASE_URL=.*@localhost:)(\d+)(/.*)$' -and $Matches[2] -ne $postgresPort) { $changed = $true; $Matches[1] + $postgresPort + $Matches[3] } else { $line } }; if ($changed) { [System.IO.File]::WriteAllLines((Resolve-Path $path), $updated, [System.Text.UTF8Encoding]::new($false)); Write-Host ('DATABASE_URL ajustado a localhost:' + $postgresPort) }"
exit /b %ERRORLEVEL%

:setEnvValue
set "MD_OPS_ENV_KEY=%~1"
set "MD_OPS_ENV_VALUE=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = '.env'; $key = $env:MD_OPS_ENV_KEY; $value = $env:MD_OPS_ENV_VALUE; if (-not (Test-Path $path) -or -not $key) { exit 1 }; $lines = Get-Content $path; $pattern = '^' + [regex]::Escape($key) + '='; $found = $false; $updated = foreach ($line in $lines) { if ($line -match $pattern) { $found = $true; $key + '=' + $value } else { $line } }; if (-not $found) { $updated += ($key + '=' + $value) }; [System.IO.File]::WriteAllLines((Resolve-Path $path), $updated, [System.Text.UTF8Encoding]::new($false))"
set "MD_OPS_ENV_KEY="
set "MD_OPS_ENV_VALUE="
exit /b %ERRORLEVEL%

:getEnvValue
set "MD_OPS_ENV_RESULT="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = '.env'; $key = $env:MD_OPS_ENV_KEY; if (-not (Test-Path $path) -or -not $key) { exit 0 }; $line = Get-Content $path | Where-Object { $_ -match ('^' + [regex]::Escape($key) + '=') } | Select-Object -First 1; if ($line) { $line.Substring($key.Length + 1) }"`) do (
  set "MD_OPS_ENV_RESULT=%%A"
)
exit /b 0

:preferPostgresMirror
set "MD_OPS_ENV_KEY=POSTGRES_IMAGE"
call :getEnvValue
set "CURRENT_POSTGRES_IMAGE=!MD_OPS_ENV_RESULT!"
set "MD_OPS_ENV_KEY="
if not defined CURRENT_POSTGRES_IMAGE (
  echo Usando mirror publico para PostgreSQL: !POSTGRES_MIRROR_IMAGE!
  call :setEnvValue POSTGRES_IMAGE "!POSTGRES_MIRROR_IMAGE!"
  set "POSTGRES_IMAGE=!POSTGRES_MIRROR_IMAGE!"
  exit /b !ERRORLEVEL!
)
if /i "!CURRENT_POSTGRES_IMAGE!"=="!POSTGRES_PRIMARY_IMAGE!" (
  echo Docker Hub puede dar timeouts; usando mirror publico para PostgreSQL: !POSTGRES_MIRROR_IMAGE!
  call :setEnvValue POSTGRES_IMAGE "!POSTGRES_MIRROR_IMAGE!"
  set "POSTGRES_IMAGE=!POSTGRES_MIRROR_IMAGE!"
  exit /b !ERRORLEVEL!
)
set "POSTGRES_IMAGE=!CURRENT_POSTGRES_IMAGE!"
echo Usando imagen PostgreSQL: !POSTGRES_IMAGE!
exit /b 0

:startDockerPostgres
echo Arrancando PostgreSQL con Docker usando !POSTGRES_IMAGE!...
call !DOCKER_CMD! compose up -d postgres
if not errorlevel 1 exit /b 0

echo.
echo Primer intento de Docker fallido.
if /i not "!POSTGRES_IMAGE!"=="!POSTGRES_MIRROR_IMAGE!" (
  echo Reintentando con mirror publico: !POSTGRES_MIRROR_IMAGE!
  call :setEnvValue POSTGRES_IMAGE "!POSTGRES_MIRROR_IMAGE!"
  set "POSTGRES_IMAGE=!POSTGRES_MIRROR_IMAGE!"
  call !DOCKER_CMD! compose up -d postgres
  if not errorlevel 1 exit /b 0
)

if /i not "!POSTGRES_IMAGE!"=="!POSTGRES_PRIMARY_IMAGE!" (
  echo Reintentando con Docker Hub: !POSTGRES_PRIMARY_IMAGE!
  call :setEnvValue POSTGRES_IMAGE "!POSTGRES_PRIMARY_IMAGE!"
  set "POSTGRES_IMAGE=!POSTGRES_PRIMARY_IMAGE!"
  call !DOCKER_CMD! compose up -d postgres
  if not errorlevel 1 exit /b 0
)

exit /b 1

:startLocalPostgresIfAvailable
if not exist scripts\start-local-postgres.ps1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$paths = @('C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe','C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe','C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'); if ($paths | Where-Object { Test-Path $_ } | Select-Object -First 1) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-local-postgres.ps1
exit /b %ERRORLEVEL%

:installLocalPostgres
set "POSTGRES_RELAUNCHED="
if exist "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" exit /b 0
if exist "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" exit /b 0
if exist "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" exit /b 0

where winget >nul 2>nul
if errorlevel 1 (
  echo winget no esta disponible para instalar PostgreSQL automaticamente.
  exit /b 1
)

call :isAdmin
if errorlevel 1 (
  echo PostgreSQL necesita permisos de administrador para instalarse.
  echo Reabriendo este script como administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/d','/c','\"%~f0\"' -WorkingDirectory '%CD%' -Verb RunAs"
  set "POSTGRES_RELAUNCHED=1"
  exit /b 1
)

echo Instalando PostgreSQL 18...
call winget install --id PostgreSQL.PostgreSQL.18 --exact --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo winget no ha podido instalar PostgreSQL 18.
  exit /b 1
)

if exist "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" exit /b 0
if exist "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" exit /b 0
if exist "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" exit /b 0

echo PostgreSQL se ha instalado, pero no encuentro pg_ctl.exe en la ruta esperada.
exit /b 1

:waitForPort
set "WAIT_PORT=%~1"
set "WAIT_TRIES=%~2"
for /l %%I in (1,1,%WAIT_TRIES%) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-NetConnection -ComputerName localhost -Port %WAIT_PORT% -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>nul
  if not errorlevel 1 exit /b 0
  if not "%%I"=="%WAIT_TRIES%" timeout /t 2 /nobreak >nul
)
exit /b 1

:stopOldMdOps
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = (Resolve-Path '.').Path; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like ('*' + $root + '*') -and $_.CommandLine -notlike '*\OpenAI\Codex\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 1"
call :cleanPrismaClient
exit /b 0

:cleanPrismaClient
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '.\node_modules\.pnpm') { Get-ChildItem -LiteralPath '.\node_modules\.pnpm' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*\node_modules\.prisma\client\query_engine-windows.dll.node*' } | ForEach-Object { try { [System.IO.File]::Delete($_.FullName) } catch {} } }"
exit /b 0

:ensureDocker
set "DOCKER_RELAUNCHED="
set "WSL_RESTART_REQUIRED="
call :refreshDockerPath
call :detectDockerDesktopExe
call :detectDockerCommand

if defined DOCKER_CMD (
  call !DOCKER_CMD! info >nul 2>nul
  if not errorlevel 1 exit /b 0
)

call :ensureWsl
if defined DOCKER_RELAUNCHED exit /b 1
if defined WSL_RESTART_REQUIRED exit /b 1

if not defined DOCKER_DESKTOP_EXE (
  call :checkDockerInstallerAlreadyRunning
  if errorlevel 1 exit /b 1
  echo Docker Desktop no esta instalado. Intentando instalarlo...
  call :installDockerDesktop
  if errorlevel 1 exit /b 1
  call :refreshDockerPath
  call :detectDockerDesktopExe
  call :detectDockerCommand
)

if not defined DOCKER_DESKTOP_EXE if not defined DOCKER_CMD exit /b 1

if defined DOCKER_DESKTOP_EXE (
  echo Abriendo Docker Desktop...
  start "" "!DOCKER_DESKTOP_EXE!"
)

call :detectDockerCommand
if not defined DOCKER_CMD exit /b 1

echo Esperando a Docker Desktop...
for /l %%I in (1,1,120) do (
  call !DOCKER_CMD! info >nul 2>nul
  if not errorlevel 1 exit /b 0
  timeout /t 2 /nobreak >nul
)
exit /b 1

:checkDockerInstallerAlreadyRunning
powershell -NoProfile -ExecutionPolicy Bypass -Command "$running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'Docker*Desktop*Installer*' }; if ($running) { Write-Host 'Ya hay un instalador de Docker Desktop en ejecucion. Espera a que termine; si lleva varios minutos sin avanzar, reinicia Windows y vuelve a ejecutar este archivo.'; exit 1 }"
exit /b %ERRORLEVEL%

:ensureWsl
powershell -NoProfile -ExecutionPolicy Bypass -Command "$text = (& wsl --status 2>&1 | Out-String) -replace [char]0, ''; if ($text -match 'no.*instalado|not.*installed|wslinstall') { exit 1 } exit 0"
if not errorlevel 1 exit /b 0

echo WSL no esta instalado. Docker Desktop necesita WSL 2 en este equipo.
call :isAdmin
if errorlevel 1 (
  echo Reabriendo este script como administrador para preparar WSL...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/d','/c','\"%~f0\"' -WorkingDirectory '%CD%' -Verb RunAs"
  set "DOCKER_RELAUNCHED=1"
  exit /b 1
)

echo Activando WSL y Virtual Machine Platform...
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
if errorlevel 1 exit /b 1
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
if errorlevel 1 exit /b 1
wsl --update >nul 2>nul
set "WSL_RESTART_REQUIRED=1"
exit /b 1

:installDockerDesktop
call :installDockerDesktopPerUser
if not errorlevel 1 exit /b 0

echo La instalacion por usuario no ha funcionado; probare instalacion global con winget.
call :isAdmin
if errorlevel 1 (
  echo Docker Desktop necesita permisos de administrador para instalarse.
  echo Reabriendo este script como administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/d','/c','\"%~f0\"' -WorkingDirectory '%CD%' -Verb RunAs"
  set "DOCKER_RELAUNCHED=1"
  exit /b 1
)

where winget >nul 2>nul
if errorlevel 1 (
  echo winget no esta disponible en este Windows.
  exit /b 1
)

set "DOCKER_WINGET_LOG=%TEMP%\md-ops-docker-winget.log"
call winget install --id Docker.DockerDesktop --exact --silent --disable-interactivity --accept-package-agreements --accept-source-agreements --log "%DOCKER_WINGET_LOG%" --verbose-logs
set "DOCKER_INSTALL_EXIT=%ERRORLEVEL%"
if "%DOCKER_INSTALL_EXIT%"=="3010" (
  echo Docker Desktop se ha instalado, pero Windows necesita reiniciarse antes de usarlo.
  exit /b 1
)

if not "%DOCKER_INSTALL_EXIT%"=="0" (
  echo winget no ha podido instalar Docker Desktop.
  echo Revisa el log de winget: %DOCKER_WINGET_LOG%
  exit /b 1
)

exit /b 0

:installDockerDesktopPerUser
set "DOCKER_INSTALLER=%TEMP%\Docker Desktop Installer.exe"
if not exist "%DOCKER_INSTALLER%" (
  echo Descargando instalador oficial de Docker Desktop...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe' -OutFile (Join-Path $env:TEMP 'Docker Desktop Installer.exe')"
  if errorlevel 1 exit /b 1
)

echo Instalando Docker Desktop para este usuario...
call "%DOCKER_INSTALLER%" install --user --quiet --accept-license --backend=wsl-2
if errorlevel 1 exit /b 1

exit /b 0

:isAdmin
net session >nul 2>nul
exit /b %ERRORLEVEL%

:refreshDockerPath
if exist "%ProgramFiles%\Docker\Docker\resources\bin" set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;%PATH%"
if exist "%LocalAppData%\Docker\Docker\resources\bin" set "PATH=%LocalAppData%\Docker\Docker\resources\bin;%PATH%"
if exist "%LocalAppData%\Programs\Docker\Docker\resources\bin" set "PATH=%LocalAppData%\Programs\Docker\Docker\resources\bin;%PATH%"
if exist "%LocalAppData%\Programs\DockerDesktop\resources\bin" set "PATH=%LocalAppData%\Programs\DockerDesktop\resources\bin;%PATH%"
exit /b 0

:detectDockerDesktopExe
set "DOCKER_DESKTOP_EXE="
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" set "DOCKER_DESKTOP_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not defined DOCKER_DESKTOP_EXE if exist "%LocalAppData%\Docker\Docker Desktop.exe" set "DOCKER_DESKTOP_EXE=%LocalAppData%\Docker\Docker Desktop.exe"
if not defined DOCKER_DESKTOP_EXE if exist "%LocalAppData%\Programs\Docker\Docker\Docker Desktop.exe" set "DOCKER_DESKTOP_EXE=%LocalAppData%\Programs\Docker\Docker\Docker Desktop.exe"
if not defined DOCKER_DESKTOP_EXE if exist "%LocalAppData%\Programs\DockerDesktop\Docker Desktop.exe" set "DOCKER_DESKTOP_EXE=%LocalAppData%\Programs\DockerDesktop\Docker Desktop.exe"
exit /b 0

:detectDockerCommand
set "DOCKER_CMD="
call :refreshDockerPath
where docker >nul 2>nul
if not errorlevel 1 (
  set "DOCKER_CMD=docker"
  exit /b 0
)

if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" (
  set "DOCKER_CMD="%ProgramFiles%\Docker\Docker\resources\bin\docker.exe""
  exit /b 0
)

if exist "%LocalAppData%\Docker\Docker\resources\bin\docker.exe" (
  set "DOCKER_CMD="%LocalAppData%\Docker\Docker\resources\bin\docker.exe""
  exit /b 0
)

if exist "%LocalAppData%\Programs\Docker\Docker\resources\bin\docker.exe" (
  set "DOCKER_CMD="%LocalAppData%\Programs\Docker\Docker\resources\bin\docker.exe""
  exit /b 0
)

if exist "%LocalAppData%\Programs\DockerDesktop\resources\bin\docker.exe" (
  set "DOCKER_CMD="%LocalAppData%\Programs\DockerDesktop\resources\bin\docker.exe""
  exit /b 0
)

exit /b 1
