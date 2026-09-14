# File d'événements

## À quoi elle sert

Sortir du chemin critique d'une requête HTTP tout ce dont l'appelant n'a pas besoin pour être servi.

Le cas d'origine est le scan d'un QR code partenaire. `PaymentService.create` écrivait la demande de réduction, **puis** créait le document de notification du partenaire, **puis** attendait sa diffusion Socket.IO — et seulement ensuite répondait au client. Le client patientait donc derrière des traitements qui ne le concernaient pas, et une notification en échec était marquée `failed` sans jamais être rejouée.

Désormais : la demande est écrite, la réponse partie, et `eventBus.publish('payment.initiated', …)` confie le reste à un consommateur.

## Garanties

- **`publish` ne lève jamais.** Le producteur est dans le chemin critique : une panne de la file ne doit pas faire échouer une demande de réduction déjà persistée.
- **Concurrence bornée** à 5 jobs simultanés, pour ne pas saturer le pool de connexions Mongo (10, fixé par coddyger).
- **3 tentatives** par événement, avec attente de 1 s, 4 s puis 16 s. Un handler signale son échec en levant une exception. L'abandon définitif est journalisé en `error`.

## Limite assumée

**La file vit dans le processus.** Un redémarrage perd les jobs en attente.

C'est acceptable ici parce que l'état métier, lui, est persisté : une notification perdue signifie que le partenaire ne reçoit pas l'alerte temps réel, mais la demande de réduction est bien en base et l'application partenaire dispose déjà de `GET /payments/last-pending/:partnerId` pour se rattraper. Aucune donnée n'est perdue, seule une notification peut manquer.

Cette implémentation suppose également **un seul processus** — `instances: 1` / `exec_mode: 'fork'` dans `ecosystem.config.js`, et un conteneur unique sous Dokploy. En cluster, chaque processus aurait sa propre file (ce qui resterait fonctionnellement correct ici, chaque événement n'étant publié que par le processus qui a traité la requête).

## Passer à une file persistante

`IEventQueue` n'expose que `publish` et `subscribe` : une implémentation BullMQ se substitue à `InMemoryEventQueue` sans toucher aux appelants. Les prérequis sont déjà réunis — `ioredis` est une dépendance directe et `docker-compose.yaml` provisionne un service `redis` avec healthcheck.

À faire le jour où c'est nécessaire (plusieurs instances, ou exigence de ne perdre aucune notification) :

1. `yarn add bullmq`.
2. Écrire `BullMqEventQueue implements IEventQueue` dans ce dossier.
3. Choisir l'implémentation dans `event-bus.ts` selon la joignabilité de `config.redis` (cf. `src/config/env.ts`).
4. Vérifier que Redis est bien déployé — sous Dokploy, le service `redis` du `docker-compose.yaml` n'existe que si l'application a été créée en type *Compose*.

## Ajouter un événement

1. Déclarer son nom dans `AppEvents` (`event-bus.ts`) — pas de chaîne en dur de part et d'autre de la file.
2. Écrire le handler dans `handlers/`, en le faisant lever en cas d'échec pour bénéficier des réessais.
3. L'abonner dans `initEventBus()` (`index.ts`).

`initEventBus()` est appelé depuis `main.ts:initPayloads()` **après** `initNotificationServices()`, dont les handlers dépendent.
