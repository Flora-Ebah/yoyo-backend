# YoYo Backend v1

![version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![node](https://img.shields.io/badge/node-%3E%3D20.15.1-brightgreen.svg)
![npm](https://img.shields.io/badge/npm-%3E%3D10.7.0-brightgreen.svg)
![license](https://img.shields.io/badge/license-ISC-blue.svg)

## Description


## Prérequis

- Node.js >= 20.15.1
- NPM >= 10.7.0
- MongoDB (optionnel)
- Docker (pour le déploiement)
- Kafka (pour le transport de données)

## Installation

1. Clonez le dépôt
2. Installez les dépendances avec `yarn`
3. Configurez les variables d'environnement :
   - Copiez le fichier `.env.sample` vers un nouveau fichier nommé `.env`
   - Modifiez les valeurs selon votre environnement

## Scripts Disponibles

### Développement

- `yarn start` : Compile et démarre l'application
- `yarn dev` : Compile et démarre l'application avec hot-reload
- `yarn build` : Compile le projet TypeScript

### Tests

- `yarn test` : Lance les tests
- `yarn test:watch` : Lance les tests en mode watch
- `yarn test:coverage` : Génère la couverture des tests

### Docker

- `yarn dk:build` : Construit l'image Docker
- `yarn dk:start` : Démarre le conteneur
- `yarn dk:stop` : Arrête le conteneur
- `yarn dk:restart` : Redémarre le conteneur
- `yarn dk:rm` : Supprime le conteneur
- `yarn dk:logs` : Affiche les logs du conteneur

### Déploiement

- `yarn deploy-local` : Déploiement local (build + start)
- `yarn deploy` : Déploiement complet (pull + rebuild + restart)

## Génération de Code avec Plop.js

Le projet utilise Plop.js pour générer automatiquement des modules et des composants.

### Commandes disponibles

```bash
# Générer un module complet (model, controller, service, route)
yarn plop module

# Générer uniquement une route
yarn plop route

# Générer uniquement un modèle
yarn plop model
```

### Structure générée

Pour un module nommé "todo" :
```
src/
├── modules/
│   └── todo/
│       ├── index.ts
│       ├── todo.model.ts
│       ├── todo.controller.ts
│       └── todo.service.ts
└── routes/
    └── todo.route.ts
```

## Configuration (.env)

### Paramètres Serveur

- `SERVER_PORT` : Le port sur lequel le serveur s'exécutera (ex : 3000)
- `SERVER_HOST` : Le chemin de base pour le serveur (ex : 'http://')

### Configuration de la Base de Données

- `DATABASE_URL` : Votre chaîne de connexion MongoDB
- `DATABASE_NAME` : Nom de la base de données à utiliser
- `USE_DATABASE` : Mettre à 'yes' pour activer l'utilisation de la base de données, 'no' pour la désactiver

### Authentification et Sécurité

- `JWT_SECRET` : Clé secrète pour la génération de jetons JWT
- `JWT_EXPIRES_IN` : Temps d'expiration pour les jetons JWT (ex : '1d' pour un jour)
- `BCRYPT_SALT_ROUND` : Nombre de tours de sel pour le hachage des mots de passe avec bcrypt

### Configuration Email

- `SMTP_HOST` : Hôte du serveur SMTP pour l'envoi d'emails
- `SMTP_PORT` : Port du serveur SMTP
- `SMTP_USER` : Nom d'utilisateur SMTP
- `SMTP_PASS` : Mot de passe SMTP
- `MAIL_FROM` : Adresse email à utiliser comme expéditeur

## Déploiement Docker

Pour déployer l'application avec Docker :

1. Assurez-vous que Docker est installé et en cours d'exécution
2. Exécutez `yarn deploy` pour construire et démarrer le conteneur

Le conteneur sera créé avec les caractéristiques suivantes :

- Nom du conteneur : lumina-api
- Port mapping : 3001:3000 (port externe:port interne)
- Redémarrage automatique en cas de crash
- Mode détaché (background)

Pour gérer le conteneur :

- Arrêter : `yarn dk:stop`
- Redémarrer : `yarn dk:restart`
