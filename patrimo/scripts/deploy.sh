#!/usr/bin/env bash
#
# Mise a jour du serveur depuis le depot git.
#
#   ./scripts/deploy.sh
#
# A lancer SUR LE SERVEUR, dans le dossier du projet. Il recupere la derniere
# version publiee, reconstruit l'image et redemarre. Les migrations de base
# s'appliquent au demarrage de l'application.
#
# Ce qui n'est JAMAIS touche : le fichier .env et le volume PostgreSQL. C'est
# ce qui rend la mise a jour sans risque — le code change, les donnees et les
# secrets restent.

set -euo pipefail
cd "$(dirname "$0")/.."

say()  { printf '  %s\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
die()  { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }

echo
echo "Patrimo — mise a jour"
echo

[ -f .env ] || die ".env est absent. Ce dossier n'a jamais ete installe :
    lancer ./scripts/setup.sh --vps la premiere fois."

command -v git >/dev/null 2>&1 || die "git n'est pas installe sur ce serveur."

# Un fichier modifie a la main sur le serveur ferait echouer le git pull au
# pire moment. On prefere s'arreter proprement et le dire.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  die "des fichiers suivis ont ete modifies sur le serveur :
$(git status --short --untracked-files=no | sed 's/^/      /')
    Reporte ces changements dans le depot, ou annule-les :
      git checkout -- ."
fi

BEFORE="$(git rev-parse --short HEAD)"
say "Recuperation de la derniere version..."
git pull --ff-only
AFTER="$(git rev-parse --short HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  ok "deja a jour ($AFTER) — reconstruction quand meme"
else
  ok "$BEFORE → $AFTER"
  git --no-pager log --oneline "$BEFORE..$AFTER" | sed 's/^/      /'
fi

# Rappel : docker-compose.override.yml publie le port 3000 sur l'hote. Il est
# ignore par git, mais un fichier laisse la par erreur exposerait l'application
# sans HTTPS a cote de Caddy.
if [ -f docker-compose.override.yml ]; then
  die "docker-compose.override.yml est present sur ce serveur.
    Il publie le port 3000 sans HTTPS. Le supprimer :  rm docker-compose.override.yml"
fi

echo
say "Construction et redemarrage..."
echo
docker compose up -d --build

echo
say "Attente de la reponse de l'application..."
for _ in $(seq 1 60); do
  if docker compose exec -T app node -e \
      "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    echo
    ok "en ligne, version $AFTER"
    # Les images intermediaires s'accumulent vite sur un petit disque.
    docker image prune -f >/dev/null 2>&1 || true
    echo
    exit 0
  fi
  sleep 2
done

echo
die "l'application n'a pas repondu. Journaux :  docker compose logs -f app"
