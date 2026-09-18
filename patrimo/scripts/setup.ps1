# Installation locale — Windows (PowerShell).
#
#   .\scripts\setup.ps1          installation locale (http://localhost:3000)
#   .\scripts\setup.ps1 -Vps     installation serveur, avec HTTPS
#
# Si Windows refuse d'executer le script :
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#
# Le script est idempotent et n'affiche jamais les secrets.

param([switch]$Vps)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$Mode = if ($Vps) { 'vps' } else { 'local' }

function Say  ($m) { Write-Host "  $m" }
function Ok   ($m) { Write-Host "  " -NoNewline; Write-Host "OK" -ForegroundColor Green -NoNewline; Write-Host " $m" }
function Warn ($m) { Write-Host "  " -NoNewline; Write-Host "!" -ForegroundColor Yellow -NoNewline; Write-Host "  $m" }
function Die  ($m) { Write-Host ""; Write-Host "  $m" -ForegroundColor Red; Write-Host ""; exit 1 }

Write-Host ""
Write-Host "Patrimo — installation ($Mode)"
Write-Host ""

# --- Prerequis --------------------------------------------------------------

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Die @"
Docker n'est pas installe.
    Installe Docker Desktop : https://www.docker.com/products/docker-desktop/
    Sur Windows, il faut aussi WSL 2 — l'installeur Docker le propose.
"@
}

try { docker compose version *> $null } catch {
  Die "Docker est installe mais 'docker compose' ne repond pas. Lance Docker Desktop une premiere fois."
}

try { docker info *> $null } catch {
  Die "Le demon Docker ne tourne pas. Lance Docker Desktop et reessaie."
}

Ok "Docker est operationnel"

# --- Generation des secrets -------------------------------------------------

# Generateur cryptographique de .NET : pas besoin d'openssl sur Windows.
#
# On utilise RNGCryptoServiceProvider et non RandomNumberGenerator::Fill, qui
# n'existe qu'a partir de .NET Core. Windows livre PowerShell 5.1 d'origine, et
# exiger l'installation de PowerShell 7 pour lancer un script d'installation
# serait absurde.
function New-Secret([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($buffer)
}

# Ecrit un fichier en UTF-8 SANS BOM. PowerShell 5.1 ajoute un BOM avec
# `Set-Content -Encoding UTF8`, et un BOM en tete de .env peut rendre la
# premiere variable illisible selon l'outil qui la relit.
function Write-Utf8([string]$Path, [string]$Content) {
  $full = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
  [System.IO.File]::WriteAllText($full, $Content, (New-Object System.Text.UTF8Encoding $false))
}

if (Test-Path '.env') {
  Warn ".env existe deja — il est conserve tel quel"
  Warn "  (pour repartir de zero : supprime-le, mais tu perdras l'acces aux"
  Warn "   donnees chiffrees avec l'ancienne cle)"
}
else {
  $SessionSecret = New-Secret 48
  $EncryptionKey = New-Secret 32
  # Sans caractere special : le mot de passe voyage dans une URL de connexion.
  $PgPass = (New-Secret 24) -replace '[/+=]', ''
  $PgPass = $PgPass.Substring(0, [Math]::Min(24, $PgPass.Length))

  if ($Mode -eq 'vps') {
    $AppDomain = Read-Host "`n  Nom de domaine de l'application (ex. finance.mondomaine.fr)"
    if ([string]::IsNullOrWhiteSpace($AppDomain)) {
      Die "Un domaine est necessaire pour obtenir un certificat HTTPS."
    }
    $AppUrl = "https://$AppDomain"
  }
  else {
    $AppDomain = 'localhost'
    $AppUrl = 'http://localhost:3000'
  }

  $stamp = Get-Date -Format 'dd/MM/yyyy a HH:mm'
  @"
# Genere par scripts/setup.ps1 le $stamp — mode $Mode.
# Ce fichier contient des secrets : il n'est jamais versionne (voir .gitignore).

DATABASE_URL="postgresql://patrimo:$PgPass@db:5432/patrimo?schema=public"
POSTGRES_USER="patrimo"
POSTGRES_PASSWORD="$PgPass"
POSTGRES_DB="patrimo"

SESSION_SECRET="$SessionSecret"

# Chiffre les donnees sensibles au repos (IBAN, identifiants de connecteurs).
# ATTENTION : changer cette cle rend illisible tout ce qui est deja chiffre.
# A sauvegarder ailleurs que sur la machine.
ENCRYPTION_KEY="$EncryptionKey"

SESSION_TTL_HOURS="720"

# Categorisation par IA — facultative. Sans cle, seules les regles
# deterministes et la categorie fournie par la banque s'appliquent.
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-sonnet-4-5"

# Connecteur Trade Republic (non officiel) — a configurer plus tard.
PYTR_PYTHON=""
TR_PHONE=""
TR_PIN=""

QUOTES_PROVIDER="stooq"
TZ="Europe/Paris"
APP_URL="$AppUrl"
APP_DOMAIN="$AppDomain"
"@ | ForEach-Object { Write-Utf8 '.env' $_ }

  Ok "Secrets generes et ecrits dans .env"
}

# --- Surcharge locale -------------------------------------------------------

if ($Mode -eq 'local') {
  if (Test-Path 'docker-compose.override.yml') {
    Ok "docker-compose.override.yml deja present"
  }
  else {
    @"
# Surcharge LOCALE — a supprimer avant de deployer sur un serveur.
#
# En production, seul Caddy est expose et c'est lui qui termine le TLS. En
# local il n'y a ni domaine ni certificat : on publie donc directement le port
# de l'application, et Caddy comme les sauvegardes restent au repos.
#
# Consequence : sans HTTPS, iOS refuse d'enregistrer le service worker.
# L'application est utilisable dans un navigateur, mais le mode hors ligne ne
# s'activera qu'une fois servie en HTTPS.

services:
  app:
    ports:
      - '3000:3000'
  caddy:
    profiles: ['prod']
  backup:
    profiles: ['prod']
"@ | ForEach-Object { Write-Utf8 'docker-compose.override.yml' $_ }
    Ok "Surcharge locale creee (port 3000 expose, Caddy desactive)"
  }
}
elseif (Test-Path 'docker-compose.override.yml') {
  Warn "docker-compose.override.yml est present : supprime-le sur un serveur, il expose le port 3000."
}

# --- Demarrage --------------------------------------------------------------

Write-Host ""
Say "Construction de l'image (3 a 5 minutes la premiere fois)..."
Write-Host ""

if ($Mode -eq 'local') {
  docker compose up -d --build db app worker
}
else {
  docker compose up -d --build
}

Write-Host ""
Say "Attente du demarrage..."

$ready = $false
foreach ($i in 1..60) {
  try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:3000/login' -UseBasicParsing -TimeoutSec 3 *> $null
    $ready = $true
    break
  }
  catch { Start-Sleep -Seconds 2 }
}

Write-Host ""
if ($ready) {
  Ok "Patrimo est en ligne"
  Write-Host ""
  if ($Mode -eq 'local') {
    Write-Host "     Ouvre  http://localhost:3000"
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1).IPAddress
    if ($ip) { Write-Host "     Depuis un telephone du meme reseau : http://${ip}:3000" }
  }
  else {
    Write-Host "     Ouvre l'URL definie dans APP_URL."
    Write-Host "     Le certificat HTTPS arrive dans une trentaine de secondes."
  }
  Write-Host ""
  Write-Host "     Au premier lancement, choisis un code a 4 a 12 chiffres."
  Write-Host ""
}
else {
  Warn "L'application n'a pas repondu dans le delai imparti."
  Warn "Journaux :  docker compose logs -f app"
  exit 1
}
