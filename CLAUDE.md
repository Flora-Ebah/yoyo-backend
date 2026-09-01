# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

`yoyo-api` — API REST Fastify + TypeScript (MongoDB/Mongoose) pour l'application YoYo. Le code est **écrit en français** : commentaires, JSDoc, logs et tous les messages destinés aux utilisateurs. Respecter cette convention lors des modifications.

## Commandes

```bash
yarn build            # tsc -> ./build
yarn dev              # tsc && nodemon build/main.js  (pas de recompilation à la volée : relancer pour prendre en compte les .ts)
yarn start            # node build/main.js
yarn pm2:start        # build + pm2 start ecosystem.config.js
yarn seed             # tous les seeders ; aussi --categories / --plans / --admin / --clean
```

Réserves à connaître avant de se fier à un script :
- `yarn test` lance `jest`, mais jest n'est pas une dépendance et `src/tests/` est vide — **il n'y a aucune infrastructure de test fonctionnelle**. Ne pas affirmer que les tests passent ; si des tests sont nécessaires, il faut d'abord mettre en place le harnais.
- `cron:test` / `cron:run` pointent vers `src/scripts/*.js`, un dossier qui n'existe pas.
- `README.md` documente des scripts `yarn dk:*` (Docker) et `yarn plop` **absents** de `package.json`. Les générateurs Plop existent (`plopfile.js` + `templates/`) mais `plop` lui-même n'est pas installé.
- `seed.js` → `load-env.js` fait un `require('dotenv')`, lui aussi absent de `package.json`.

## Architecture

### Cheminement d'une requête

`src/api/routes/*.route.ts` → `modules/<nom>/<nom>.controller.ts` → `<nom>.service.ts` → `<nom>.model.ts` (une sous-classe de `MongoDbDao`) → modèle Mongoose.

Les routes sont **enregistrées automatiquement** : `src/router.ts` appelle `coddyger.filesInclude(__dirname + '/api/routes', 'route')` et enregistre chaque correspondance sous le préfixe `/${API_VERSION}${SERVER_PATH}`. Un nouveau fichier dans `src/api/routes/` dont le nom contient `route` est pris en compte sans câblage ; il n'existe aucune liste centrale de routes.

### `coddyger` est la colonne vertébrale du framework

Presque tous les fichiers l'importent. Il fournit `env` (configuration serveur/base/JWT/mail lue depuis `.env`), `defines` (`status.*`, `message.*`), `api(reply, promise)` (l'écrivain de réponse), `catchReturn`, `MongoDbDao`, `string.isEmpty` / `string.isValidObjectId`, `konsole`, `root()`, `AxiosService`, `filesInclude` et `getDatabaseAccess`. **Mongoose et axios ne figurent pas dans `package.json`** — ils arrivent de façon transitive via `coddyger`.

### Contrat de réponse

Les contrôleurs ne propagent jamais d'exception vers Fastify. Chaque méthode retourne une `new Promise(...)` qui résout `{ status, message, data }` et se termine par `.catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, nomDeLaMethode))`. Le handler de route fait `return coddyger.api(reply, Q)`.

Particularité à conserver en reprenant ces patterns : dans les endpoints de liste, le contrôleur place les **métadonnées de pagination dans `message`** et les lignes dans `data` (`message: items.data, data: items.rows`).

### Modèle et DAO dans un même fichier

Chaque `*.model.ts` déclare le schéma Mongoose, exporte `mongoose.model(...)` et exporte une classe `<Nom>Set extends MongoDbDao<T> implements IData<T>` qui surcharge `select` (paginé, renvoie `{rows, totalRows, totalPages, countRowsPerPage, totalPagesPerQuery}`), `selectHug` (non paginé) et `selectOne`. Les services instancient le `Set`, jamais le modèle brut.

La suppression logique est la convention : un enum `status` (`active | inactive | suspended | removed | ...`) avec `{ $nin: ['removed', 'archived'] }` injecté dans les requêtes. Les documents déclarent explicitement un champ `_id: Schema.Types.ObjectId`.

Les erreurs du DAO sont retournées, pas levées : `{ error: true, data: e }`. Les services vérifient `if (data.error) throw data`.

### Authentification

`TokenMiddleware.verify` / `verifyAdmin` (`src/api/middleware/token.middleware.ts`) en `preHandler` Fastify. JWT via `env.jwt.secret` (utilisateur) et `env.jwt.secretAuth`. Au-delà de la vérification de signature, chaque requête consulte une liste de révocation via `TokenSet` (`src/shared/models/token.model.ts`) — la déconnexion y désactive les jetons. Les handlers lisent l'appelant dans `request.user`.

### Validation — deux systèmes coexistants

1. Schéma JSON Fastify déclaré en ligne dans `schema.body` / `schema.query` de la route (la norme ; alimente aussi Swagger). `src/router.ts` réécrit les erreurs AJV en messages français.
2. Un middleware Joi `validateSchema` (`src/api/middleware/validate.middleware.ts`), utilisé uniquement par `src/api/schemas/plan.schema.ts`.

### La configuration est répartie sur deux sources

- `env` de `coddyger` — serveur, base de données, JWT, origines, mail.
- `src/config/env.ts` exporte `config` — Redis, RabbitMQ, SIGOBE, activation de Swagger, secret de broadcast.

Pour retrouver un paramètre, vérifier les deux. `.env.sample` documente l'ensemble complet (Claude ne peut pas lire les fichiers `.env*` — ils sont refusés dans `.claude/settings.json`).

### Ordre de démarrage (`src/main.ts`)

`new Router()` → `listen()` → `initPayloads()` : connexion à la base (uniquement si `USE_DATABASE=yes`) → construction de `SocketIOHelper` sur le serveur HTTP brut → `initNotificationServices().init()` → `MainHelper.setDefaultProfile()` → démarrage des crons de nettoyage et de renouvellement d'abonnement. Tout ce qui dépend de Socket.IO ou des notifications doit s'exécuter après `listen`, pas au moment de l'import.

### Services transversaux

- **Socket.IO** — créé après le `listen` et conservé dans une variable de module de `main.ts` ; y accéder via `getSocketIO()` ou le décorateur `request.io` enregistré dans `router.ts`.
- **Notifications** — singleton `NotificationManager` (`src/services/notification/`) avec des implémentations `NotificationService` enfichables, indexées par `NotificationType`. Email et Push sont enregistrés ; **le SMS est écrit mais commenté** dans `services/notification/index.ts`.
- **Crons** — `src/cron/` (`subscription-renewal`, `cleanup-clients`), démarrés depuis `main.ts`. Voir `src/cron/README.md` pour le flux d'activation `pendingRenewal`.
- **Paiements** — `PaymentHelper` (Orange Money, `src/helpers/payment.helper.ts`) est utilisé par `transaction.service.ts`. `cinetpay.helper.ts`, `cache.helper.ts` (Redis) et `v2.helper.ts` ne sont actuellement référencés nulle part et ne sont pas exportés depuis `src/helpers/index.ts`.

### Structure du domaine

`client` (utilisateur final, indicateur `isPartner`, `notificationSettings` / `securitySettings` imbriqués) et `admin` sont des collections distinctes avec des chemins d'authentification distincts. `login` est un module à part entière qui suit les tentatives, le verrouillage et les sessions. `plan` → `subscription` → `transaction` → `payment` constitue la chaîne de facturation. `question` contient les questions secrètes référencées par `client.secretQuestion`.

## Ajouter un module

Suivre un module existant de petite taille (`src/modules/category/` est la référence la plus propre) et reproduire les cinq fichiers : `index.ts` (barrel), `*.interface.ts`, `*.model.ts` (schéma + DAO `Set`), `*.service.ts`, `*.controller.ts`, plus `src/api/routes/<nom>.route.ts`. `plopfile.js` et `templates/` encodent la même structure, si plop venait à être installé.

## Déploiement

- PM2 est le runtime : `ecosystem.config.js` (application `yoyo`, `build/main.js`, port 30141 en dev / 3014 en prod) ainsi que des cibles `pm2 deploy` pointant vers `ultrondev.com`, branches `main` (prod) et `dev`.
- `deploy.bat <production|development>` est le chemin de déploiement SSH sous Windows. Il contient des **identifiants git en clair** — ne pas les recopier ailleurs et traiter le fichier comme sensible.
- `push.bat <msg>` commite sur `dev`, puis met `main` à jour depuis `dev`.
- Le `Dockerfile` (multi-étapes, node 20 alpine, utilisateur non root) est fonctionnel. `docker compose up -d` construit depuis ce `Dockerfile` et démarre l'app plus un service `redis` ; la configuration vient de `env_file: .env`, le conteneur écoute sur 3000 et `${SERVER_PORT}` ne choisit que le port publié. Deux endpoints de disponibilité : `GET /health` (hors préfixe, utilisé par le healthcheck) et `GET {prefix}/container`.

## Style

`.prettierrc` : tabulations, `singleQuote`, `printWidth` 120, pas de virgule finale — appliqué de façon inconsistante (beaucoup de modules utilisent une indentation de 2 espaces). S'aligner sur le fichier en cours d'édition plutôt que de le reformater. Le `tsconfig` est en `strict: true` mais `noImplicitAny: false`, et les handlers de route s'appuient largement sur `any`.
