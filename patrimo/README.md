# Patrimo

Application web personnelle de suivi budgétaire et patrimonial. Auto-hébergée,
installable sur l'écran d'accueil d'un iPhone comme d'un Android, et
**partageable avec un proche** : chaque personne a son profil, son code, et ses
données — invisibles des autres.

Deux modules :

- **Budget** — import de relevés, catégorisation automatique, deux modes de
  gestion au choix (Suivi façon Bankin', Enveloppes façon YNAB), détection des
  abonnements, prévisionnel de solde, recommandations d'économies, alertes.
- **Patrimoine** — agrégation de sources d'investissement, répartition par classe
  d'actifs, performance comparée à des indices, signaux d'arbitrage, projections.

---

## À lire avant d'installer

Trois limites structurelles, qui viennent des fournisseurs et non du code.

**Yomoni n'a aucune API.** Ni publique, ni documentée, et il n'existe aucun
client open source. Le suivi du contrat se fait par **saisie manuelle** — un
écran dédié, une fois par mois, trente secondes. C'est moins séduisant qu'un
connecteur, mais ça ne casse jamais.

**Trade Republic n'a pas d'API officielle.** Le connecteur fourni passe par
[`pytr`](https://github.com/pytr-org/pytr), une bibliothèque non officielle qui
rejoue le protocole websocket de l'application mobile. Concrètement : c'est
contraire aux CGU de Trade Republic, ça peut cesser de fonctionner à chaque mise
à jour de leur application, et une ré-authentification 2FA est nécessaire quand
la session expire. **À vérifier avant de compter dessus** : je ne peux pas
garantir que `pytr` fonctionne encore aujourd'hui. Si le connecteur tombe, le
reste de l'application continue de fonctionner et la dernière valorisation reste
affichée avec sa date.

**Les agrégateurs bancaires DSP2 sont difficilement accessibles à un
particulier.** Powens, Bridge et équivalents sont des services B2B sous licence,
avec contrat d'entreprise et tarification à plusieurs centaines d'euros par mois.
L'offre gratuite historique — Nordigen, devenue GoCardless Bank Account Data —
**n'accepte plus de nouvelles inscriptions** (constaté en septembre 2026).
[Enable Banking](https://enablebanking.com) propose aujourd'hui un accès gratuit
en « production restreinte », limité aux comptes que l'on relie soi-même : c'est
la piste la plus crédible pour un connecteur BoursoBank automatique. **À vérifier
avant de s'engager** : ces conditions changent souvent, et je n'ai pas testé
cette API.

En attendant, le socle de ce projet est l'**import de fichiers** (CSV, OFX, QIF),
assumé dans l'architecture et non traité comme un plan B. L'interface
`src/server/patrimoine/connectors/types.ts` est prête à accueillir un connecteur
bancaire le jour où l'un devient praticable, sans rien réécrire ailleurs.

**Règle qui ne bougera pas : la saisie manuelle reste disponible sur toutes les
sources, connecteur ou pas.** Un connecteur non officiel finit toujours par
casser ; il ne doit pas emmener le suivi avec lui. Une valorisation saisie et une
valorisation synchronisée sont stockées de la même façon, et le reste de
l'application ne fait aucune différence entre les deux.

**Ce que « partagé » veut dire, et ne veut pas dire.** Les profils cloisonnent
les données à l'intérieur de l'application : personne ne voit les comptes d'un
autre depuis l'interface, et le code de chacun protège son profil. Mais celui
qui administre le serveur a, par construction, un accès à la base. Partager
l'application avec quelqu'un, c'est lui demander de vous faire confiance sur
l'administration de la machine — c'est un partage entre proches, pas un service
multi-locataires.

Un quatrième point, de conception celui-là : **les recommandations d'arbitrage
patrimonial ne sont pas générées par un modèle de langage.** Chaque signal sort
d'une règle explicite et affiche son calcul, pour qu'on puisse le contredire en
trente secondes. L'IA n'intervient que sur la catégorisation des dépenses, où
l'erreur est visible et rattrapable.

---

## Stack

| Choix | Raison |
|---|---|
| Next.js 15 (App Router) + TypeScript | Un seul processus pour le rendu et l'API, sortie `standalone` légère en Docker |
| PostgreSQL + Prisma | Montants en `Decimal`, migrations versionnées |
| Tailwind CSS | Mobile-first sans feuille de style à maintenir |
| Recharts | Graphiques lisibles sur un écran de téléphone |
| Service worker écrit à la main | Contrôle exact de ce qui est mis en cache — et de ce qui ne l'est jamais |
| Docker Compose + Caddy | Un `docker compose up -d`, HTTPS automatique |

Les montants circulent **en centimes entiers** dans toute la logique métier et en
`Decimal` en base. Aucune arithmétique en virgule flottante sur des euros.

---

## Installation

Un script fait tout : vérification de Docker, génération des secrets, écriture
de la configuration, construction et démarrage. Il est idempotent et n'affiche
jamais les secrets.

### macOS et Linux

```bash
tar xzf patrimo.tar.gz && cd patrimo
./scripts/setup.sh
```

### Windows

```powershell
tar -xzf patrimo.tar.gz; cd patrimo
.\scripts\setup.ps1
```

> Si Windows refuse d'exécuter le script :
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
>
> Le script fonctionne avec le PowerShell 5.1 livré avec Windows — pas besoin
> d'installer PowerShell 7.

Dans les deux cas, l'application écoute ensuite sur `http://localhost:3000`.

Au premier lancement, elle demande **un prénom et un code à 4 à 12 chiffres** —
c'est le profil propriétaire de l'installation. Elle crée ensuite son plan de
catégories, ses règles de départ et un compte courant, puis propose deux façons
de démarrer : importer un relevé, ou saisir simplement le solde actuel. Les deux
se complètent, et l'écran se saute.

Pour ajouter la personne avec qui vous partagez : **Réglages → Profils → Ajouter
un profil**. Il faut son prénom, le code qu'elle choisit, et votre propre code
pour confirmer.

### Sur un serveur, avec HTTPS

```bash
./scripts/setup.sh --vps        # demande le nom de domaine
```

Il faut un VPS avec Docker et un enregistrement DNS de type A pointant vers son
adresse IP. Caddy obtient le certificat Let's Encrypt en une trentaine de
secondes. **Supprimer `docker-compose.override.yml`** avant de déployer : ce
fichier expose le port 3000, ce qui n'a de sens qu'en local.

### Ce que le script génère

| Fichier | Rôle |
|---|---|
| `.env` | Secrets et configuration. Jamais versionné, permissions 600. |
| `docker-compose.override.yml` | Local uniquement : publie le port 3000, met Caddy et les sauvegardes au repos. |

> `ENCRYPTION_KEY` chiffre les données sensibles au repos. **La changer rend
> illisible tout ce qui a déjà été chiffré.** À sauvegarder ailleurs que sur la
> machine.

---

## Quel serveur, à quel prix

**Ce dont l'application a besoin.** Mesuré sur cette base de code : la
construction Next.js culmine à **environ 800 Mo** de mémoire. Il faut y ajouter
PostgreSQL et le système. Concrètement :

| RAM | Verdict |
|---|---|
| 2 Go | Passe, mais sans marge. Activer du swap avant de construire, sinon l'OOM killer coupe le build en silence. |
| 4 Go | Confortable. C'est le choix par défaut. |
| Plus | Inutile ici. |

Un seul cœur suffit ; 20 Go de disque aussi, sauf historique très long.

**Ordres de grandeur, septembre 2026.** Les tarifs ci-dessous viennent de
comparatifs publics et **ne sont pas vérifiés sur les sites des hébergeurs** :
les confirmer avant de commander, les grilles bougent souvent.

| Offre | Config | Prix indicatif |
|---|---|---|
| Hetzner CAX11 (ARM) ou CX22 | 2 vCPU · 4 Go · 40 Go | ≈ 4,50–5 € HT/mois |
| OVHcloud VPS Starter | 1 vCore · 2 Go · 20 Go | ≈ 3,50 € HT/mois |
| Scaleway DEV1-S | 2 vCPU · 2 Go · 20 Go | ≈ 8 € HT/mois |

**Le moins cher qui tienne vraiment**, si l'application doit être joignable en
permanence : un Hetzner ARM à 4 Go, plus un nom de domaine. Compter **5 à 6 €
TTC par mois**, tout compris. L'image Docker se construit sans rien changer sur
ARM — `node:22-alpine` est multi-architecture, et un Mac Apple Silicon est déjà
sur la même architecture.

**Encore moins cher : zéro euro.** Garder l'application sur le Mac et y accéder
de l'extérieur via Tailscale. Le coût réel n'est pas financier, il est
opérationnel : le Mac doit rester allumé et réveillé. Pour quelqu'un qui se
déplace souvent, c'est le mode « je consulte mes comptes et la machine dort à la
maison » — c'est-à-dire pas de consultation. À réserver à la phase de test.

**Sur le nom de domaine.** Un `.fr` ou `.com` coûte une dizaine d'euros par an.
Un sous-domaine gratuit (DuckDNS et équivalents) fonctionne aussi avec Caddy et
Let's Encrypt, tant que le port 80 est joignable. C'est moins élégant, c'est
gratuit, et ça ne change rien au fonctionnement.

**Ce qu'il ne faut pas prendre** : une offre « hébergement mutualisé » à 2 €.
Elle ne fait tourner ni Docker ni PostgreSQL. La ligne à chercher s'appelle
VPS, ou serveur cloud.

### GitHub n'est pas un hébergement

Point à lever tout de suite, parce qu'il coûte cher en malentendus : **mettre le
code sur GitHub ne fait pas tourner l'application.** GitHub stocke du code.
GitHub Pages sert des fichiers statiques — or cette application a un serveur
Node et une base PostgreSQL, donc Pages ne peut pas l'exécuter.

Ce que le dépôt apporte réellement, c'est le **chemin de mise à jour** : au lieu
d'un `scp` d'archive à chaque correction, le serveur fait un `git pull`.

```bash
./scripts/deploy.sh        # sur le serveur, dans le dossier du projet
```

Le script récupère la dernière version, reconstruit, redémarre et attend que
l'application réponde. Il refuse de tourner si des fichiers ont été modifiés à
la main sur le serveur, ou si `docker-compose.override.yml` traîne encore. Le
fichier `.env` et le volume PostgreSQL ne sont jamais touchés : **le code
change, les données et les secrets restent.**

Première installation depuis le dépôt, sur le serveur :

```bash
git clone git@github.com:<toi>/patrimo.git && cd patrimo
./scripts/setup.sh --vps
```

### Et les plateformes qui déploient depuis GitHub ?

Railway, Render, Fly.io déploient directement depuis un dépôt : un `git push`,
et l'application se met à jour. C'est confortable. Deux objections, dans cet
ordre d'importance.

**La première est le sujet même de ce projet.** Sur ces plateformes, les
opérations bancaires vivent dans une base gérée par un tiers, sur une
infrastructure qu'on ne contrôle pas. Toute la conception de cette application —
auto-hébergement, chiffrement au repos, secrets sur une machine à soi — part du
choix inverse. Ce n'est pas une question de confiance envers ces sociétés, c'est
une question de cohérence : si les données peuvent aller chez un tiers, autant
utiliser Bankin' ou Finary, qui font le travail mieux et gratuitement.

**La seconde est le prix.** Ordres de grandeur de septembre 2026, **à vérifier**,
et qui ne couvrent que la partie application — la base PostgreSQL gérée se
facture en plus :

| Plateforme | Application seule | Offre gratuite |
|---|---|---|
| Render | ≈ 7 $/mois | Oui, mais le service s'endort après ~15 min d'inactivité |
| Fly.io | ≈ 7 $/mois | Non pour les comptes créés après octobre 2024 |
| Railway | ≈ 10–15 $/mois | Non, seulement un crédit d'essai |

Une base gérée par-dessus, et on arrive à 12–30 € par mois : deux à cinq fois le
prix d'un VPS qui fait tourner les deux.

**Conclusion** : dépôt sur GitHub pour le code et les mises à jour, VPS pour
l'exécution et les données. On garde le confort du `git push` sans confier ses
relevés à qui que ce soit.

### Déployer, pas à pas

```bash
# 1. Sur le serveur, fraîchement créé (Debian ou Ubuntu)
ssh root@<ip-du-serveur>
curl -fsSL https://get.docker.com | sh

# 2. Récupérer le projet — depuis le dépôt git…
git clone git@github.com:<toi>/patrimo.git && cd patrimo

#    …ou, sans dépôt, en envoyant l'archive depuis le Mac :
#    scp patrimo.tar.gz root@<ip-du-serveur>:~
#    tar xzf patrimo.tar.gz && cd patrimo

# 3. Installer
rm -f docker-compose.override.yml     # local uniquement, expose le port 3000
./scripts/setup.sh --vps              # demande le nom de domaine

# Les fois suivantes, une seule commande :
./scripts/deploy.sh
```

Avant l'étape 3, créer un enregistrement DNS de type **A** qui pointe le
sous-domaine choisi vers l'IP du serveur. Caddy obtient le certificat
Let's Encrypt dans la minute qui suit. Si le certificat n'arrive pas, la cause
est presque toujours le DNS pas encore propagé, ou le port 80 fermé.

Deux choses à faire une seule fois, et à ne pas remettre à plus tard :

- **copier `ENCRYPTION_KEY` hors de la machine** (gestionnaire de mots de passe) ;
- vérifier que les sauvegardes tombent : `ls backups/` le lendemain.

---

## Installer sur l'écran d'accueil

**iPhone / iPad**

1. Ouvrir l'URL **dans Safari** (Chrome sur iOS ne sait pas installer de PWA).
2. Bouton Partager → **Sur l'écran d'accueil**.
3. Valider.

**Android**

1. Ouvrir l'URL dans Chrome.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Valider.

Sur Android, Chrome n'affiche l'option d'installation que sur une origine
sécurisée : sur une adresse en `http://`, il faut passer par « Ajouter à l'écran
d'accueil », qui crée un simple raccourci sans mode hors ligne.

L'icône apparaît sur l'écran d'accueil. L'application s'ouvre en plein écran,
sans barre d'adresse ni onglets.

**Rien à installer pour la personne avec qui vous partagez.** Elle ouvre la même
URL, choisit son profil, saisit son code. Ajouter l'icône à son écran d'accueil
se fait exactement de la même manière, depuis son propre téléphone.

**Le rôle exact du HTTPS.** L'ajout à l'écran d'accueil et l'affichage plein
écran fonctionnent même sur une adresse en `http://` — par exemple l'IP de la
machine sur le réseau local. En revanche, iOS refuse d'enregistrer un service
worker hors contexte sécurisé : sans HTTPS, pas de mode hors ligne et pas de
mise en cache du code, donc un rechargement complet à chaque ouverture.

Trois façons d'obtenir du HTTPS, par ordre d'effort croissant :

| Voie | Ce qu'il faut | Disponibilité |
|---|---|---|
| Réseau local en `http://` | Rien | Seulement à la maison, sans hors ligne |
| [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) | `tailscale serve 3000` | Partout, tant que la machine est allumée |
| VPS + domaine | ~5 €/mois | Partout, tout le temps |

Tailscale attribue un nom en `*.ts.net` avec un vrai certificat, sans domaine à
acheter. **À vérifier** : la documentation ne précise pas si Serve est inclus
dans le plan personnel gratuit — le confirmer avant de compter dessus.

Ce qui rend l'installation possible, côté code :

- `display: "standalone"` dans `public/manifest.webmanifest` ;
- `apple-mobile-web-app-capable` et le titre iOS, via `appleWebApp` dans
  `src/app/layout.tsx` ;
- `viewport-fit=cover` plus les variables `env(safe-area-inset-*)`, pour que
  l'interface passe sous l'encoche et au-dessus de la barre de geste ;
- des icônes PNG **opaques** (une icône transparente s'affiche sur fond noir
  sur iOS) ;
- une origine en HTTPS — sans quoi iOS refuse d'enregistrer le service worker.

**Si l'application s'ouvre dans Safari avec la barre d'adresse**, c'est presque
toujours qu'une ancienne version du manifeste est en cache. Retirer l'icône de
l'écran d'accueil, forcer le rechargement dans Safari, puis réinstaller.

---

## Importer un relevé

**Préférer l'OFX quand la banque le propose.** Il porte un identifiant unique par
opération et le solde du relevé : la déduplication devient exacte au lieu
d'heuristique, et le prévisionnel s'ancre sur un solde réel plutôt que sur un
cumul de mouvements qui dérive dès qu'une opération manque.

Formats acceptés : **CSV**, **OFX 1.x et 2.x**, **QIF**.

Profils CSV reconnus à la signature de leur en-tête : **BoursoBank** (vérifié
sur un export réel), Crédit Agricole, BNP Paribas, Société Générale, LCL,
Fortuneo, Hello bank!, Revolut, N26. Un format inconnu passe en détection
heuristique des colonnes — l'écran d'import affiche alors le profil utilisé et
le détail des lignes ignorées.

> Seul le profil BoursoBank a été confronté à un vrai fichier. Les autres
> viennent de formats publiquement documentés. Si un import bascule en détection
> automatique, comparer l'en-tête du fichier avec le profil correspondant dans
> `src/server/import/csv.ts` et l'ajuster — c'est une dizaine de lignes.

**Plusieurs comptes dans un seul fichier.** Un export BoursoBank mélange le
compte courant et la carte à débit différé. L'application les sépare
automatiquement à partir de la colonne `accountNum`, crée un compte par
référence, et retient le solde de chacun. Les confondre compterait chaque
dépense deux fois : une fois à l'achat sur la carte, une fois au prélèvement
mensuel — lequel est reconnu comme mouvement interne et exclu des dépenses.

**Catégorie fournie par la banque.** Quand l'export en contient une, elle est
utilisée après les règles et avant l'IA. Sur un relevé réel, les règles par
enseigne couvrent environ un quart des opérations ; la catégorie de la banque
fait passer ce taux à environ trois quarts, sans aucun appel à un modèle. Les
correspondances trop vagues (« Vie quotidienne > Vie quotidienne ») sont
volontairement ignorées plutôt que traduites au hasard.

**Déduplication.** Réimporter un fichier déjà traité, ou un export qui chevauche
le précédent, ne crée rien. L'empreinte inclut un rang d'occurrence calculé dans
le fichier, ce qui permet de conserver deux cafés identiques payés le même jour
tout en reconnaissant un doublon d'import.

Depuis un iPhone : télécharger le relevé depuis l'app de la banque, choisir
« Enregistrer dans Fichiers », puis le sélectionner dans l'écran d'import.

---

## Les deux modes budgétaires

Sélectionnables et interchangeables à tout moment, depuis l'écran Budget.

### Mode Suivi (façon Bankin')

Approche a posteriori. Les dépenses sont constatées puis comparées à un budget
mensuel par catégorie. Le dépassement est autorisé et signalé.

Le bouton « Proposer des budgets » calcule la **médiane** des six derniers mois
par catégorie, arrondie à 5 €. La médiane plutôt que la moyenne : un seul mois
avec un achat exceptionnel ne doit pas fixer la cible durablement.

### Mode Enveloppes (façon YNAB)

Budget base zéro. Chaque euro disponible est affecté à une enveloppe avant d'être
dépensé, et le montant « à répartir » doit tendre vers zéro.

Trois notions à ne pas confondre :

| | |
|---|---|
| **Alloué** | ce qui a été mis dans l'enveloppe ce mois-ci |
| **Dépensé** | ce qui en est sorti ce mois-ci |
| **Disponible** | report du mois précédent + alloué − dépensé |

Le report est ce qui distingue YNAB d'un budget mensuel ordinaire : un reste de
40 € en octobre est encore là en novembre, et un dépassement de −30 € aussi.

**L'âge de l'argent** mesure le délai moyen entre l'arrivée d'un euro sur le
compte et sa dépense. Calcul par appariement FIFO : les entrées forment une file,
chaque dépense consomme les euros les plus anciens, et l'indicateur est la
moyenne des dix dernières dépenses. Au-delà de 30 jours, vous dépensez l'argent
du mois précédent — c'est le seul chiffre de YNAB qui mesure vraiment la distance
prise avec le mois à mois.

Le montant « à répartir » se calcule comme *argent réellement disponible sur les
comptes − somme des enveloppes positives*, et non comme *revenus cumulés −
allocations*. Avec un historique importé de douze mois, la seconde formule
afficherait des dizaines de milliers d'euros qui n'existent pas sur le compte.

### La bascule

Passer d'un mode à l'autre **ne touche aucune transaction ni aucune
catégorisation**. Les deux modes sont des couches d'allocation posées par-dessus
la même source de vérité.

- Vers **Enveloppes** : une enveloppe est créée par catégorie de dépense, et les
  budgets du mois sont repris comme allocations.
- Vers **Suivi** : les allocations du mois sont reprises comme budgets. Les
  enveloppes et leurs allocations sont **conservées** — rebasculer retrouve
  l'état exact, reports compris.

---

## Connecteurs patrimoniaux

### Saisie manuelle — le socle, disponible sur toutes les sources

L'écran Patrimoine porte un formulaire « Mettre à jour à la main », **actif pour
n'importe quelle source, connecteur ou pas** : date, valorisation totale,
versements cumulés (facultatif), répartition par poche (ETF, actions en direct,
obligations, fonds euros, immobilier, crypto, liquidités).

Ce n'est pas un plan B, c'est le socle. Yomoni n'a pas d'API, le connecteur Trade
Republic est non officiel et cassera un jour, et une source nouvelle (PEA, PER,
immobilier) doit pouvoir entrer dans la vue consolidée le jour même. Trente
secondes par mois, et ça ne casse jamais.

Le formulaire refuse une répartition qui s'écarte de plus de 2 % du total saisi.
Une erreur de saisie sur un patrimoine se propage ensuite dans la répartition, la
performance et les recommandations d'arbitrage : mieux vaut la bloquer à l'entrée.

Saisir une répartition **remplace** la composition connue de la source — sinon,
sur un compte déjà synchronisé, le même argent serait compté deux fois. Ne
renseigner que le total met la valeur à jour et laisse la composition affichée
telle qu'elle était.

Chaque saisie crée un point d'historique. Le reste de l'application ne fait
aucune différence entre une donnée saisie et une donnée synchronisée : un
connecteur qui casse laisse un historique intact, qu'on continue à la main.

### Trade Republic — connecteur non officiel

Sur le serveur, installer `pytr` dans son propre environnement Python :

```bash
python3 -m venv /opt/pytr-venv
/opt/pytr-venv/bin/pip install pytr
```

Puis dans `.env` :

```ini
PYTR_PYTHON="/opt/pytr-venv/bin/python"
TR_PHONE="+33612345678"
TR_PIN="1234"
```

Première authentification, à faire **une fois depuis un terminal** (elle demande
un code reçu dans l'application mobile) :

```bash
docker compose run --rm app npx tsx -e \
  "import('./src/server/patrimoine/connectors/tradeRepublic.js').then(m => m.tradeRepublicLogin())"
```

Ensuite, la synchronisation tourne chaque nuit à 3 h 15, et se déclenche à la
demande depuis l'écran Patrimoine.

Le pont Python est dans `scripts/tr_bridge.py`. Il renvoie toujours un objet JSON
sur la sortie standard, réussite ou échec. **Les noms de messages du protocole
qu'il utilise sont ceux observés par le projet `pytr` — ils ne sont garantis par
personne.** Si le connecteur casse, l'écran Patrimoine affiche l'erreur, la
dernière valorisation connue reste visible avec sa date, et un signal
« données périmées » apparaît au bout de 40 jours.

### Cotations et indices

Fournisseur par défaut : [Stooq](https://stooq.com) — gratuit, sans clé, données
de fin de journée. Indices suivis : CAC 40, MSCI World (via IWDA), S&P 500,
Stoxx Europe 600.

La comparaison de performance se fait en base 100. **Elle compare des
valorisations, pas des performances au sens strict** : un versement fait monter
la courbe du portefeuille sans qu'aucune performance ait été réalisée.
L'application détecte les sauts de valorisation suspects et affiche
l'avertissement correspondant.

---

## Catégorisation

Les **règles déterministes passent avant l'IA**. Une règle est reproductible,
vérifiable et gratuite ; l'IA ne traite que ce qu'aucune règle ne couvre.

Environ 150 règles de départ couvrent les enseignes françaises courantes. Surtout :
**chaque recatégorisation manuelle crée une règle apprise**, prioritaire sur le
catalogue livré. L'usage de l'IA décroît donc au fil des mois au lieu de croître.

Sans `ANTHROPIC_API_KEY`, l'application fonctionne : les opérations non couvertes
restent « Non catégorisé » et attendent un classement manuel.

Ce qui est envoyé au modèle : **le libellé et le montant, rien d'autre.** Ni
numéro de compte, ni solde, ni identité. Une classification en dessous de 50 % de
confiance est rejetée — mieux vaut « Non catégorisé » qu'une catégorie fausse qui
pollue silencieusement les statistiques.

---

## Analyses

**Récurrences.** Regroupement par libellé débruité (les dates, numéros de carte
et références de mandat sont retirés avant comparaison), puis analyse de la
régularité des intervalles. Trois occurrences minimum.

**Abonnements et charges fixes.** Les deux sont détectés de la même façon, mais
totalisés séparément : un « coût des abonnements » qui inclut le loyer est exact
et inutilisable. Le logement, les assurances, la santé et les impôts partent en
« charges fixes » ; les virements d'épargne sont exclus des deux.

**Hausses de tarif.** Un abonnement est une récurrence dont le
montant forme un ou deux paliers stables. Point important : juger la stabilité
sur l'écart min/max ferait perdre exactement les abonnements qu'on veut suivre —
ceux qui augmentent. Le regroupement se fait donc par paliers, avec une tolérance
serrée (2 %), ce qui distingue un abonnement passé de 15,49 € à 19,99 € d'un
panier de courses variant continûment entre 48 € et 79 €.

**Prévisionnel de solde.** Solde connu, plus les échéances récurrentes restantes,
plus une estimation des dépenses variables au rythme journalier des trois mois
précédents (hors récurrences, pour ne pas les compter deux fois). Une fourchette
à un écart-type est affichée : un chiffre unique serait faussement précis.

**Recommandations d'économies.** Sept règles déterministes : doublons
d'abonnements par famille de service, hausses de tarif, abonnements dont le
prélèvement a cessé, dérive d'une catégorie contre sa moyenne, frais bancaires
annuels, petites dépenses répétées chez un même marchand, budgets décorrélés du
réel. Chacune affiche son calcul et les opérations qui la justifient.

**Alertes.** Huit types, seuils configurables, chacune désactivable. Chaque
événement porte une clé de déduplication : une même situation ne notifie qu'une
fois, même si le job tourne toutes les nuits.

---

## Profils

Une installation, plusieurs personnes. Le premier profil créé est
**propriétaire** de l'installation ; les suivants sont des invités.

| | Propriétaire | Invité |
|---|---|---|
| Voir ses propres données | oui | oui |
| Voir celles des autres | **non** | **non** |
| Créer un profil | oui | non |
| Supprimer un profil | oui (sauf le sien) | non |
| Réinitialiser le code d'un autre | oui | non |
| Changer son propre code | oui | oui |

Créer, supprimer un profil ou réinitialiser un code exige **le code du
propriétaire au moment de l'acte** — pas seulement une session ouverte. La
session pouvant durer trente jours, une simple confirmation ne prouverait rien
sur un téléphone déverrouillé.

Ce que chaque profil possède en propre : ses comptes bancaires, ses opérations,
son plan de catégories, ses règles apprises, ses budgets et enveloppes, ses
abonnements détectés, ses alertes, ses sources patrimoniales, son mode
budgétaire, son jour de début de mois, son profil de risque. Ne sont communs que
les **cours de bourse et les indices** — ce sont des données de marché,
identiques pour tout le monde.

Techniquement, chaque table de données personnelles porte une colonne `profileId`
**non nulle**, toutes les contraintes d'unicité sont portées au niveau du profil
(deux personnes peuvent avoir chacune un « Compte courant »), et chaque fonction
serveur reçoit l'identifiant du profil en premier argument — un oubli devient une
erreur de compilation, pas une fuite. Le script `scripts/smoke.ts` termine par
dix vérifications d'étanchéité, dont deux tentatives d'écriture croisée qui
doivent échouer.

Supprimer un profil supprime **toutes** ses données, en cascade. C'est
irréversible.

---

## Publier le code sur GitHub

Le dépôt ne contient **que du code**. Aucune donnée personnelle n'y entre, par
construction : les opérations vivent dans PostgreSQL, les secrets dans `.env`,
et ni l'un ni l'autre n'est versionné. Publier le dépôt ne publie donc rien de
personnel — à condition de vérifier avant, une fois.

```bash
./scripts/check-before-push.sh
```

Le script répond à une seule question : est-ce qu'un secret ou une donnée est
sur le point de partir ? Il regarde ce qui est **réellement** suivi par git et
ce qui est **réellement** dans l'historique — pas ce que le `.gitignore`
prétend. Il vérifie quatre choses :

- aucun `.env`, relevé (`.csv`, `.ofx`, `.qif`), sauvegarde ou dump n'est suivi ;
- aucun de ces fichiers n'existe dans l'historique des commits ;
- aucune valeur de secret n'apparaît dans un fichier suivi ;
- `.env.example` est présent, pour que celui qui clone sache quoi renseigner.

**Le point le plus important, et celui qu'on découvre trop tard :** retirer un
fichier du dépôt ne le retire pas de l'historique. Un `.env` commité une fois
reste lisible dans tous les commits qui suivent, même après suppression, même
après `git rm`. Si le script signale ce cas, la solution la plus sûre n'est pas
de réécrire l'historique — c'est de repartir d'un dépôt neuf :

```bash
rm -rf .git && git init && git add . && git commit -m "Patrimo"
```

Après publication, si un secret est parti quand même : le considérer comme
compromis et le régénérer. Supprimer le dépôt ne suffit pas, GitHub et ses
miroirs gardent des copies.

### Deux façons de partager, à ne pas confondre

|  | Même serveur, deux profils | Dépôt GitHub, deux installations |
|---|---|---|
| Ce qui est partagé | Le serveur et sa base | Le code seulement |
| Où vivent ses données | Chez toi | Chez lui |
| Peux-tu lire ses données | **Oui**, via la base | **Non**, jamais |
| Peut-il lire les tiennes | Non, l'app cloisonne | Non |
| Ce qu'il doit installer | Rien, il ouvre une URL | Docker, et faire tourner son instance |
| Qui paye le serveur | Toi | Chacun le sien, ou rien s'il reste en local |

Les deux se cumulent : le dépôt public, et une installation partagée pour ceux
qui ne veulent pas administrer une machine.

**Mon avis** : si ton ami est capable de lancer Docker, la voie GitHub est
franchement meilleure. Elle supprime la seule vraie réserve du partage par
profil — le fait que l'administrateur du serveur puisse lire la base — et elle
t'évite d'être responsable des données financières de quelqu'un d'autre. Garde
le partage par profil pour quelqu'un qui ne veut rien administrer.

### Licence

Sans fichier `LICENSE`, un dépôt public reste **tous droits réservés** : le code
est visible mais personne n'a le droit de l'utiliser. Si l'intention est que ton
ami — ou n'importe qui — puisse s'en servir, ajouter une licence permissive
(MIT) est une ligne de plus et évite l'ambiguïté.

---

## Sécurité

Le modèle de menace est celui d'une application personnelle partagée entre
proches : quelqu'un qui tombe sur l'URL, un téléphone laissé déverrouillé, un
proche curieux.

- Code PIN haché en **scrypt** (paramètres calibrés pour ~100 ms), comparaison à
  temps constant, **un code par profil**.
- Verrouillage 15 minutes après 5 tentatives, compté par profil.
- Session en cookie `httpOnly` + `SameSite=Lax` + `Secure`, signée HS256.
- Middleware qui protège toutes les routes ; une requête d'API non authentifiée
  reçoit un 401, pas une redirection HTML.
- Données sensibles chiffrées en **AES-256-GCM** au repos.
- Postgres n'expose aucun port sur l'hôte.
- HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`.

**Ce qui n'est pas protégé** : un attaquant disposant d'un accès root au serveur,
ni le propriétaire de l'installation, qui peut lire la base directement. C'est
assumé, et c'est précisément la raison de l'hébergement personnel plutôt que d'un
service tiers — mais c'est à dire clairement à la personne avec qui vous
partagez.

---

## Comportement hors ligne

Le service worker met en cache **le code de l'application**, jamais **les
données**. Afficher un solde périmé sans le dire serait pire qu'afficher une
erreur. Hors ligne, la navigation retombe sur une page qui l'explique.

---

## Tâches planifiées

Dans le conteneur `worker`, fuseau `TZ` :

| Heure | Tâche |
|---|---|
| 03:15 | Synchronisation patrimoniale, cotations, point consolidé |
| 06:30 | Détection des récurrences, virements internes, évaluation des alertes |
| 07:00 | Reconduction des budgets, au premier jour du mois budgétaire |

Une passe d'analyse tourne aussi au démarrage du worker.

---

## Développement

```bash
npm install
cp .env.example .env      # DATABASE_URL vers un Postgres local

npx prisma migrate dev
npm run dev               # http://localhost:3000

npm test                  # 41 tests unitaires
npm run typecheck
npx tsx scripts/smoke.ts  # test de bout en bout — EFFACE la base pointée
```

`scripts/smoke.ts` génère douze mois d'opérations plausibles, les importe par le
vrai pipeline, et vérifie une trentaine de propriétés : déduplication à
l'identique et sur un export chevauchant, détection des abonnements et des
hausses de tarif, cohérence des répartitions, absence de perte à la bascule entre
les deux modes, conservation du total lors d'une réallocation, encadrement du
prévisionnel, non-répétition des alertes.

### Organisation

```
src/
  lib/                    montants, dates, normalisation des libellés, chiffrement
  server/
    import/               parseurs CSV/OFX/QIF, déduplication, virements internes
    categorize/           taxonomie, règles, classification IA, apprentissage
    budget/               mode Suivi, mode Enveloppes, âge de l'argent, bascule
    analysis/             récurrences, prévisionnel, recommandations, alertes
    patrimoine/           connecteurs, cotations, consolidation, signaux
    worker.ts             tâches planifiées
  app/                    pages et routes d'API
  components/             interface
scripts/
  tr_bridge.py            pont Python vers pytr
  generate-icons.ts       icônes PWA
  smoke.ts                test de bout en bout
```

---

## Exploitation

```bash
docker compose logs -f app worker     # journaux
docker compose up -d --build          # déployer une nouvelle version
```

Sauvegardes quotidiennes automatiques dans `./backups`, conservées 30 jours.
Restauration :

```bash
docker compose exec -T db pg_restore -U patrimo -d patrimo --clean < backups/patrimo-20260902.dump
```

**Code oublié** — le réinitialiser depuis le serveur :

```bash
docker compose exec db psql -U patrimo -d patrimo -c 'DELETE FROM "Settings";'
```

L'application repropose alors l'écran de création. Les données sont conservées.

---

## Ce qui n'est pas fait

Pour éviter les mauvaises surprises :

- Aucune connexion bancaire automatique — BoursoBank comprise. Import de
  fichiers uniquement. La piste Enable Banking décrite plus haut n'est pas
  implémentée, seulement documentée.
- Le connecteur Trade Republic n'a pas été testé contre un compte réel dans cette
  session. **À vérifier avant de s'y fier.**
- Pas de notifications push. Les alertes s'affichent dans l'application.
- Pas de gestion multi-devises. Tout est en euros.
- Pas de suivi de l'immobilier physique ni des cryptomonnaies détenues hors des
  sources connectées — le modèle de données les prévoit, les connecteurs non.
- Les projections de patrimoine ignorent la fiscalité, l'inflation et les frais
  de gestion. Ce sont des hypothèses de travail, pas des prévisions.
- Les profils cloisonnent l'interface, pas la base : le propriétaire du serveur
  peut lire les données de tout le monde en s'y connectant directement.
- Pas de budget commun entre deux profils. Chacun le sien ; une dépense partagée
  se saisit des deux côtés, ou d'un seul.
- Pas de récupération de code par email. Un code oublié se réinitialise depuis le
  profil propriétaire ; si c'est celui du propriétaire qui est perdu, il faut
  passer par la base.
