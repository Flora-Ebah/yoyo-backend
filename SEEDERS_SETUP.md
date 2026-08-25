# 🌱 Configuration des Seeders YoYo

## 📋 Prérequis

1. **Node.js** (version 18 ou supérieure)
2. **MongoDB** (local ou distant)
3. **Variables d'environnement** configurées

## ⚙️ Configuration

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet avec le contenu suivant :

```env
ENV=dev
APP_NAME=YOYO La Carte
USE_DB=yes
DB_URI=mongodb://localhost:27017/yoyo
DB_NAME=yoyo
SERVER_PORT=3014
SERVER_HOST=http://localhost:3014
SERVER_PATH=/yoyo
API_VERSION=v1
ORIGINS=*

# SESSION JWT TOKEN
# Générez vos propres valeurs — voir l'encadré ci-dessous. Ne commitez jamais un secret réel.
JWT_SECRET=<32 caractères aléatoires minimum>
JWT_PUBLIC=<clé technique propre à cet environnement>
JWT_AUTH_SECRET=<32 caractères aléatoires minimum>
JWT_TOKEN_EXPIRE=365d
DEFAULT_ACCOUNT=admin@votre-domaine.com:<mot de passe fort, 12 caractères minimum>
```

> ⚠️ **Ces valeurs étaient auparavant écrites en clair dans ce fichier** — clé de signature des
> jetons, clé technique partagée par les 4 applications, clé des jetons de rafraîchissement et
> compte administrateur `admin@yoyocarte.com:admin`. La clé de signature suffit à forger un jeton
> `isAdmin: true` : **tout environnement qui les utilise encore doit être considéré comme compromis
> et ses secrets renouvelés** (elles restent lisibles dans l'historique Git).
>
> Générer un secret : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
>
> La plateforme **refuse de démarrer en production** tant qu'un secret publié, absent ou trop court
> est en place (`src/config/security-check.ts`). Hors production, elle se contente d'avertir.

**Important :** Ajustez `DB_URI` selon votre configuration MongoDB :
- Local : `mongodb://localhost:27017/yoyo`
- Distant : `mongodb://username:password@host:port/database`

### 3. Démarrer MongoDB

Assurez-vous que MongoDB est démarré et accessible.

## 🚀 Utilisation

### Scripts NPM

```bash
# Exécuter tous les seeders
npm run seed

# Seeder des catégories seulement
npm run seed:categories

# Seeder des plans seulement
npm run seed:plans

# Nettoyer les données seedées
npm run seed:clean
```

### Script direct

```bash
# Depuis la racine du projet
node seed.js [options]

# Exemples
node seed.js                    # Exécuter tous les seeders
node seed.js --categories       # Seeder des catégories seulement
node seed.js --plans            # Seeder des plans seulement
node seed.js --clean            # Nettoyer les données
node seed.js --help             # Afficher l'aide
```

## 📊 Données seedées

### Catégories (20 catégories)
- Alimentation, Mode & Beauté, Électronique, Santé & Bien-être
- Transport, Divertissement, Éducation, Services Financiers
- Immobilier, Automobile, Voyage & Tourisme, Sport & Fitness
- Art & Culture, Jardinage & Bricolage, Animaux & Vétérinaires
- Technologie & Informatique, Événements & Cérémonies
- Loisirs & Hobbies, Services à Domicile, Autres

### Plans d'abonnement (6 plans)
1. **Gratuit** (0 XOF) - 7 jours d'essai
2. **Basic** (2 500 XOF/mois) - Plan essentiel
3. **Premium** (5 000 XOF/mois) ⭐ *Populaire*
4. **Gold** (10 000 XOF/mois) - Plan VIP
5. **Premium Annuel** (50 000 XOF/an) ⭐ *Économie*
6. **Entreprise** (25 000 XOF/mois) - Multi-utilisateurs

## 🔧 Dépannage

### Erreur de connexion MongoDB
```
Error: Cannot connect to MongoDB
```
**Solution :** Vérifiez que MongoDB est démarré et que `DB_URI` est correct.

### Erreur de module non trouvé
```
Error: Cannot find module 'mongoose'
```
**Solution :** Exécutez `npm install` pour installer les dépendances.

### Erreur de variables d'environnement
```
Error: DB_URI is not defined
```
**Solution :** Créez le fichier `.env` avec les variables requises.

## 📝 Logs

Les seeders génèrent des logs détaillés :

```
🌱 Démarrage des seeders...

📡 Connexion à la base de données établie
📂 Seeding des catégories...
✅ Catégorie "Alimentation" créée avec succès
✅ Catégorie "Mode & Beauté" créée avec succès
⏭️  Catégorie "Électronique" existe déjà, ignorée

📊 Résumé du seeding des catégories:
   - Créées: 18
   - Ignorées: 2
   - Total: 20

💳 Seeding des plans d'abonnement...
✅ Plan "Gratuit" créé avec succès
✅ Plan "Basic" créé avec succès
✅ Plan "Premium" créé avec succès

🎉 Tous les seeders ont été exécutés avec succès!
📡 Connexion à la base de données fermée
```

## ⚠️ Précautions

- **Sauvegarde** : Toujours sauvegarder la base de données avant d'exécuter les seeders
- **Environnement** : Vérifiez que vous êtes sur le bon environnement (dev/test/prod)
- **Doublons** : Les seeders vérifient les doublons, mais soyez prudent
- **Dépendances** : Exécuter les catégories avant les plans (dépendances)

## 🔄 Workflow de développement

```bash
# 1. Configurer l'environnement
cp .env.sample .env
# Éditer .env avec vos paramètres

# 2. Installer les dépendances
npm install

# 3. Démarrer MongoDB
# (selon votre configuration)

# 4. Exécuter les seeders
npm run seed

# 5. Vérifier les données dans la base
```

## 🆘 Support

En cas de problème :
1. Vérifiez les logs d'erreur
2. Vérifiez la configuration MongoDB
3. Vérifiez les variables d'environnement
4. Consultez la documentation MongoDB
