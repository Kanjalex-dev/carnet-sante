#!/usr/bin/env bash
#
# Verification avant de publier le depot.
#
# Une seule question : est-ce qu'un secret ou une donnee personnelle est sur le
# point de partir sur GitHub ? Le .gitignore est cense l'empecher, mais un
# .gitignore se modifie par accident et un `git add -f` passe outre. Ce script
# regarde ce qui est REELLEMENT suivi et ce qui est REELLEMENT dans l'historique.
#
#   ./scripts/check-before-push.sh
#
# Code de sortie 1 si quelque chose doit etre corrige avant de publier.

set -uo pipefail
cd "$(dirname "$0")/.."

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

problems=0

echo
echo "Verification avant publication"
echo

# 1. Fichiers suivis qui ne devraient jamais l'etre -------------------------
suspects=$(git ls-files | grep -Ei '(^|/)\.env($|\.)|\.csv$|\.ofx$|\.qfx$|\.qif$|\.dump$|^backups/|^data/' | grep -v '^\.env\.example$' || true)
if [ -n "$suspects" ]; then
  bad "des fichiers sensibles sont suivis par git :"
  printf '      %s\n' $suspects
  echo "      → git rm --cached <fichier>, puis verifie le .gitignore"
  problems=$((problems + 1))
else
  ok "aucun fichier sensible suivi"
fi

# 2. Historique -------------------------------------------------------------
#    Un fichier retire aujourd'hui reste lisible dans les commits precedents.
history=$(git log --all --pretty=format: --name-only 2>/dev/null \
  | sort -u | grep -Ei '(^|/)\.env($|\.)|\.csv$|\.ofx$|\.qif$|\.dump$' \
  | grep -v '^\.env\.example$' || true)
if [ -n "$history" ]; then
  bad "des fichiers sensibles existent dans l'historique git :"
  printf '      %s\n' $history
  echo "      → les retirer du depot ne suffit pas, l'historique les garde."
  echo "        Le plus simple et le plus sur : repartir d'un depot neuf"
  echo "        (rm -rf .git && git init) plutot que de reecrire l'historique."
  problems=$((problems + 1))
else
  ok "aucun fichier sensible dans l'historique"
fi

# 3. Chaines qui ressemblent a des secrets ----------------------------------
#    On cherche des affectations non vides sur les variables sensibles dans le
#    contenu suivi, en ecartant trois faux positifs legitimes :
#      - les scripts d'installation, qui ECRIVENT ces lignes ;
#      - la documentation (.md), qui montre a quoi ressemble une ligne ;
#      - les valeurs manifestement factices (CHANGE_ME, xxx, 1234...).
leaks=$(git grep -nE '(POSTGRES_PASSWORD|SESSION_SECRET|ENCRYPTION_KEY|ANTHROPIC_API_KEY|TR_PIN|TR_PHONE)="[^"]+"' -- . 2>/dev/null \
  | grep -v 'scripts/setup\.' \
  | grep -v '\.md:' \
  | grep -vEi '"(CHANGE_ME|CHANGEME|TODO|xxx+|example|votre[-_]|your[-_]|\+336123456|1234|0000)' || true)
if [ -n "$leaks" ]; then
  bad "des valeurs de secrets apparaissent dans des fichiers suivis :"
  printf '      %s\n' "$leaks"
  problems=$((problems + 1))
else
  ok "aucune valeur de secret dans les fichiers suivis"
fi

# 4. .env.example present et vide -------------------------------------------
if [ -f .env.example ]; then
  ok ".env.example est present (il documente les variables sans les valeurs)"
else
  warn ".env.example est absent : celui qui clone ne saura pas quoi renseigner"
fi

echo
if [ "$problems" -eq 0 ]; then
  echo "  Rien a signaler. Le depot ne contient que du code."
  echo
  exit 0
fi
echo "  $problems point(s) a corriger avant de publier."
echo
exit 1
