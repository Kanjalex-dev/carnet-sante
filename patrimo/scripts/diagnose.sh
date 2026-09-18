#!/usr/bin/env bash
#
# Collecte tout ce qu'il faut pour comprendre pourquoi l'application ne demarre
# pas. A lancer dans le dossier du projet :
#
#   ./scripts/diagnose.sh
#
# La sortie est concue pour etre copiee-collee telle quelle. Elle ne contient
# AUCUN secret : les valeurs de .env ne sont jamais affichees, seulement le fait
# qu'elles soient presentes et de longueur plausible.

set -uo pipefail
cd "$(dirname "$0")/.."

titre() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

echo "Patrimo — diagnostic"
titre "Machine"
printf '  %s\n' "$(uname -sm)"
docker --version 2>/dev/null || echo "  docker : ABSENT"
docker compose version 2>/dev/null | head -1 || echo "  docker compose : ABSENT"

titre "Le demon Docker repond-il ?"
if docker info >/dev/null 2>&1; then
  echo "  oui"
else
  echo "  NON — Docker Desktop n'est pas lance, ou pas encore pret."
  echo "  C'est la cause. Lance Docker Desktop, attends la baleine, relance setup.sh."
  exit 0
fi

titre "Etat des conteneurs"
docker compose ps 2>&1 | sed 's/^/  /'

titre "Redemarrages (un compteur qui monte = l'application plante en boucle)"
for s in db app worker; do
  cid=$(docker compose ps -q "$s" 2>/dev/null | head -1)
  if [ -n "$cid" ]; then
    printf '  %-7s %s  redemarrages=%s\n' "$s" \
      "$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)" \
      "$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null)"
  else
    printf '  %-7s (conteneur absent)\n' "$s"
  fi
done

titre "Journaux de l'application — 40 dernieres lignes"
docker compose logs --no-color --tail=40 app 2>&1 | sed 's/^/  /'

titre "Journaux de la base — 15 dernieres lignes"
docker compose logs --no-color --tail=15 db 2>&1 | sed 's/^/  /'

titre "Le port 3000 est-il pris par autre chose ?"
if command -v lsof >/dev/null 2>&1; then
  occupants=$(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null | tail -n +2)
  if [ -n "$occupants" ]; then
    echo "$occupants" | awk '{printf "  %s (pid %s)\n", $1, $2}'
  else
    echo "  personne n'ecoute sur 3000"
  fi
else
  echo "  (lsof indisponible)"
fi

titre "L'application repond-elle ?"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login 2>/dev/null || echo "aucune reponse")
echo "  http://127.0.0.1:3000/login  →  $code"

titre "Configuration (valeurs jamais affichees)"
if [ -f .env ]; then
  for k in DATABASE_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB SESSION_SECRET ENCRYPTION_KEY; do
    # On extrait la valeur pour en mesurer la longueur, sans jamais l'imprimer.
    v=$(grep -E "^${k}=" .env | head -1 | cut -d= -f2- | tr -d '"' || true)
    if [ -z "$v" ]; then
      printf '  %-20s \033[31mVIDE ou ABSENTE\033[0m\n' "$k"
    else
      printf '  %-20s presente (%s caracteres)\n' "$k" "${#v}"
    fi
  done
else
  echo "  .env ABSENT — l'installation n'a jamais abouti. Relancer ./scripts/setup.sh"
fi

titre "Surcharge locale"
if [ -f docker-compose.override.yml ]; then
  echo "  presente (normal en local : elle publie le port 3000)"
  grep -A2 "ports:" docker-compose.override.yml 2>/dev/null | sed 's/^/    /'
else
  echo "  ABSENTE — en local, le port 3000 n'est alors PAS publie,"
  echo "  et rien ne peut repondre sur localhost:3000. C'est probablement la cause."
fi

echo
echo "Fin du diagnostic. Copie tout ce qui precede."
echo
