# syntax=docker/dockerfile:1
#
# Image de production. Construction en plusieurs etapes : l'image finale ne
# contient ni le code source TypeScript, ni les dependances de developpement.

# --- Dependances -------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# libc6-compat : Prisma et sharp attendent la glibc, absente d'Alpine par defaut.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

# --- Construction ------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma a besoin d'une URL syntaxiquement valide pour generer le client, meme
# sans base joignable a la construction.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build
# Les icones sont generees a la construction : elles ne sont pas versionnees.
RUN npx tsx scripts/generate-icons.ts

# --- Dependances d'execution --------------------------------------------------
#
# Etape dediee, et c'est le coeur de la correction d'un bug qui a coute une
# soiree : l'image finale enumerait a la main les dossiers de node_modules a
# copier (prisma, tsx, @prisma...). Cette enumeration est intenable, parce que
# ces paquets ont eux-memes des dependances : `prisma` a besoin de `effect`,
# `tsx` a besoin de `esbuild`. Aucun des deux n'etait copie, et les conteneurs
# redemarraient en boucle sur "Cannot find module".
#
# On ne devine plus : npm calcule la fermeture transitive a partir du lockfile.
FROM node:22-alpine AS runtime-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
# --ignore-scripts : aucun script d'installation n'a de raison de tourner ici.
RUN npm ci --omit=dev --ignore-scripts

# --- Execution ---------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat tzdata

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# L'application ne tourne pas en root.
RUN addgroup -g 1001 -S nodejs && adduser -S patrimo -u 1001

# L'ordre compte. On pose d'abord les dependances d'execution completes, puis
# la sortie `standalone` de Next par-dessus : ses propres node_modules viennent
# completer l'ensemble sans rien retirer.
COPY --from=runtime-deps --chown=patrimo:nodejs /app/node_modules ./node_modules

COPY --from=builder /app/public ./public
COPY --from=builder --chown=patrimo:nodejs /app/.next/standalone ./
COPY --from=builder --chown=patrimo:nodejs /app/.next/static ./.next/static

# Le client Prisma est GENERE a la construction : il ne peut pas venir de
# l'installation des dependances, seulement de l'etape qui a lance
# `prisma generate`.
COPY --from=builder --chown=patrimo:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Necessaires aux migrations et au worker au demarrage.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER patrimo
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
