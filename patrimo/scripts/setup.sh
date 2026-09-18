#!/usr/bin/env bash
#
# Installation locale — macOS et Linux.
#
#   ./scripts/setup.sh          installation locale (http://localhost:3000)
#   ./scripts/setup.sh --vps    installation serveur, avec HTTPS
#
# Le script est idempotent : relance-le sans crainte, il ne touche pas a un
# .env existant. Les secrets ne sont jamais affiches.

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="local"
[ "${1:-}" = "--vps" ] && MODE="vps"

say()  { printf '  %s\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }

echo
echo "Patrimo — installation ($MODE)"
echo

# --- Prerequis --------------------------------------------------------------

command -v docker >/dev/null 2>&1 || die \
  "Docker n'est pas installe.
    macOS : brew install --cask docker, puis lancer Docker Desktop
    Linux : https://docs.docker.com/engine/install/"

docker compose version >/dev/null 2>&1 || die \
  "Docker est installe mais 'docker compose' ne repond pas.
    Sur macOS, il faut lancer l'application Docker Desktop au moins une fois."

docker info >/dev/null 2>&1 || die \
  "Le demon Docker ne tourne pas. Lance Docker Desktop et reessaie."

ok "Docker est operationnel"

# --- Generation des secrets -------------------------------------------------

# openssl est present partout sur macOS et Linux ; on garde un repli sur Python
# pour les environnements minimalistes.
gen() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$bytes" | tr -d '\n'
  else
    python3 -c "import base64,os;print(base64.b64encode(os.urandom($bytes)).decode(),end='')"
  fi
}

if [ -f .env ]; then
  warn ".env existe deja — il est conserve tel quel"
  warn "  (pour repartir de zero : supprime-le, mais tu perdras l'acces aux"
  warn "   donnees chiffrees avec l'ancienne cle)"
else
  SESSION_SECRET="$(gen 48)"
  ENCRYPTION_KEY="$(gen 32)"
  # Sans caractere special : le mot de passe voyage dans une URL de connexion.
  PG_PASS="$(gen 24 | tr -d '/+=' | cut -c1-24)"

  if [ "$MODE" = "vps" ]; then
    printf '\n  Nom de domaine de l'"'"'application (ex. finance.mondomaine.fr) : '
    read -r APP_DOMAIN
    [ -n "$APP_DOMAIN" ] || die "Un domaine est necessaire pour obtenir un certificat HTTPS."
    APP_URL="https://$APP_DOMAIN"
  else
    APP_DOMAIN="localhost"
    APP_URL="http://localhost:3000"
  fi

  cat > .env <<EOF
# Genere par scripts/setup.sh le $(date '+%d/%m/%Y a %H:%M') — mode $MODE.
# Ce fichier contient des secrets : il n'est jamais versionne (voir .gitignore).

DATABASE_URL="postgresql://patrimo:${PG_PASS}@db:5432/patrimo?schema=public"
POSTGRES_USER="patrimo"
POSTGRES_PASSWORD="${PG_PASS}"
POSTGRES_DB="patrimo"

SESSION_SECRET="${SESSION_SECRET}"

# Chiffre les donnees sensibles au repos (IBAN, identifiants de connecteurs).
# ATTENTION : changer cette cle rend illisible tout ce qui est deja chiffre.
# A sauvegarder ailleurs que sur la machine.
ENCRYPTION_KEY="${ENCRYPTION_KEY}"

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
APP_URL="${APP_URL}"
APP_DOMAIN="${APP_DOMAIN}"
EOF
  chmod 600 .env
  ok "Secrets generes et ecrits dans .env (permissions 600)"
fi

# --- Surcharge locale -------------------------------------------------------

if [ "$MODE" = "local" ]; then
  if [ -f docker-compose.override.yml ]; then
    ok "docker-compose.override.yml deja present"
  else
    cat > docker-compose.override.yml <<'EOF'
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
EOF
    ok "Surcharge locale creee (port 3000 expose, Caddy desactive)"
  fi
else
  [ -f docker-compose.override.yml ] && warn \
    "docker-compose.override.yml est present : supprime-le sur un serveur, il expose le port 3000."
fi

# --- Demarrage --------------------------------------------------------------

echo
say "Construction de l'image (3 a 5 minutes la premiere fois)…"
echo

if [ "$MODE" = "local" ]; then
  docker compose up -d --build db app worker
else
  docker compose up -d --build
fi

# --- Verification de l'image ------------------------------------------------
#
# Garde-fou contre un bug qui a reellement eu lieu : l'image se construisait
# sans erreur, mais il lui manquait des dependances d'execution, et les
# conteneurs redemarraient en boucle sur "Cannot find module". Le symptome
# n'apparaissait qu'apres deux minutes d'attente, sous la forme d'un message
# sans rapport avec la cause.
#
# On verifie donc, avant d'attendre quoi que ce soit, que l'image sait
# reellement executer les deux commandes dont elle a besoin au demarrage.
echo
say "Verification de l'image…"
if ! docker compose run --rm --no-deps --entrypoint sh app -c \
     'node -e "require.resolve(\"esbuild\")" && ./node_modules/.bin/prisma --version' \
     >/dev/null 2>&1; then
  echo
  die "l'image est construite mais incomplete : il lui manque des dependances
    d'execution. Ce n'est pas un probleme de configuration de ta part.
    Reconstruire sans cache :  docker compose build --no-cache"
fi
ok "l'image contient ses dependances d'execution"

echo
say "Attente du demarrage…"
URL="http://127.0.0.1:3000/login"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$URL" 2>/dev/null; then
    echo
    ok "Patrimo est en ligne"
    echo
    if [ "$MODE" = "local" ]; then
      echo "     Ouvre  http://localhost:3000"
      IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
      [ -n "$IP" ] && echo "     Depuis un telephone du meme reseau : http://$IP:3000"
    else
      echo "     Ouvre  $(grep '^APP_URL' .env | cut -d'\"' -f2)"
      echo "     Le certificat HTTPS arrive dans une trentaine de secondes."
    fi
    echo
    echo "     Au premier lancement, choisis un code a 4 a 12 chiffres."
    echo
    exit 0
  fi
  sleep 2
done

# --- Echec : on montre pourquoi, on ne renvoie pas vers une autre commande ----
#
# Dire "voir les journaux" a quelqu'un qui installe pour la premiere fois, c'est
# lui demander de faire le diagnostic a notre place. On le fait ici.

echo
warn "L'application n'a pas repondu dans le delai imparti."
echo

printf '  \033[1m── Etat des conteneurs ──\033[0m\n'
docker compose ps 2>&1 | sed 's/^/  /'

echo
printf '  \033[1m── Journaux de l application (30 dernieres lignes) ──\033[0m\n'
docker compose logs --no-color --tail=30 app 2>&1 | sed 's/^/  /'

echo
printf '  \033[1m── Causes les plus frequentes ──\033[0m\n'

# 1. Quelqu'un d'autre occupe deja le port 3000.
if command -v lsof >/dev/null 2>&1; then
  intrus=$(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null \
    | tail -n +2 | grep -vi docker | head -3 || true)
  if [ -n "$intrus" ]; then
    warn "le port 3000 est deja pris par un autre programme :"
    echo "$intrus" | awk '{printf "      %s (pid %s)\n", $1, $2}'
    echo "      → arrete-le, ou change '3000:3000' en '3001:3000' dans"
    echo "        docker-compose.override.yml puis relance ce script."
  fi
fi

# 2. Le conteneur redemarre en boucle : c'est l'application qui plante.
cid=$(docker compose ps -q app 2>/dev/null | head -1)
if [ -n "$cid" ]; then
  restarts=$(docker inspect -f '{{.State.RestartCount}}' "$cid" 2>/dev/null || echo 0)
  if [ "${restarts:-0}" -gt 0 ]; then
    warn "le conteneur a redemarre $restarts fois : l'application plante au demarrage."
    echo "      La raison est dans les journaux ci-dessus."
  fi
fi

# 3. La surcharge locale absente : rien n'est publie sur l'hote.
if [ "$MODE" = "local" ] && [ ! -f docker-compose.override.yml ]; then
  warn "docker-compose.override.yml est absent : en local, le port 3000"
  echo "      n'est pas publie et rien ne peut repondre sur localhost."
fi

echo
say "Pour un diagnostic complet, sans aucun secret affiche :"
say "  ./scripts/diagnose.sh"
echo
exit 1
