param(
  [string]$ProjectRef = "uvkkmqxnxpnnffxwevuw",
  [string]$SupabaseUrl = "https://uvkkmqxnxpnnffxwevuw.supabase.co",
  [string]$PagesUrl = "https://nahuelgranollers.github.io/MDops",
  [string]$CorsOrigin = "https://nahuelgranollers.github.io"
)

$ErrorActionPreference = "Stop"

function Read-RequiredSecret([string]$Name) {
  $secure = Read-Host $Name -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  if (-not $value) {
    throw "$Name no puede estar vacio."
  }
  return $value
}

function New-Secret([int]$Bytes = 48) {
  $buffer = [byte[]]::new($Bytes)
  [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToBase64String($buffer)
}

function Invoke-Npx {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ArgsForNpx)
  & "C:\Program Files\nodejs\npx.cmd" @ArgsForNpx
}

function Set-VercelEnv([string]$Name, [string]$Value) {
  Write-Host "Configurando $Name en Vercel production..."
  Invoke-Npx @("--yes", "vercel@latest", "env", "rm", $Name, "production", "--yes") 2>$null | Out-Null
  $Value | & "C:\Program Files\nodejs\npx.cmd" --yes vercel@latest env add $Name production | Out-Null
}

Write-Host "1) Comprobando sesion de Vercel..."
$whoami = Invoke-Npx @("--yes", "vercel@latest", "whoami")
if ($LASTEXITCODE -ne 0) {
  Write-Host "Inicia sesion con: npx vercel login"
  throw "Vercel no esta autenticado."
}
Write-Host "Vercel autenticado como $whoami"

Write-Host "2) Si este repo aun no esta enlazado a Vercel, ejecuta el link interactivo."
$link = Read-Host "Ejecutar 'vercel link' ahora? (s/N)"
if ($link -match "^(s|si|y|yes)$") {
  Invoke-Npx @("--yes", "vercel@latest", "link")
}

$databaseUrl = Read-RequiredSecret "DATABASE_URL completa de Supabase"
$serviceRole = Read-Host "SUPABASE_SERVICE_ROLE_KEY privada (opcional, Enter para omitir)" -AsSecureString
$serviceRoleBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($serviceRole)
try {
  $serviceRoleValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($serviceRoleBstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($serviceRoleBstr)
}

Set-VercelEnv "NODE_ENV" "production"
Set-VercelEnv "PUBLIC_APP_URL" $PagesUrl
Set-VercelEnv "CORS_ORIGIN" $CorsOrigin
Set-VercelEnv "UPLOAD_DIR" "/tmp"
Set-VercelEnv "DATABASE_URL" $databaseUrl
Set-VercelEnv "JWT_ACCESS_SECRET" (New-Secret)
Set-VercelEnv "JWT_REFRESH_SECRET" (New-Secret)
Set-VercelEnv "SUPABASE_URL" $SupabaseUrl
if ($serviceRoleValue) {
  Set-VercelEnv "SUPABASE_SERVICE_ROLE_KEY" $serviceRoleValue
}

Write-Host "3) Inicializando Supabase CLI local si hace falta..."
if (-not (Test-Path ".\supabase")) {
  Invoke-Npx @("--yes", "supabase@latest", "init")
}

Write-Host "Vinculando Supabase project ref $ProjectRef..."
Invoke-Npx @("--yes", "supabase@latest", "link", "--project-ref", $ProjectRef)

Write-Host ""
Write-Host "Listo. Siguientes comandos recomendados:"
Write-Host "  corepack pnpm install"
Write-Host "  `$env:DATABASE_URL='[la misma DATABASE_URL]'; corepack pnpm db:migrate"
Write-Host "  `$env:DATABASE_URL='[la misma DATABASE_URL]'; corepack pnpm db:seed"
Write-Host "  npx vercel --prod"
