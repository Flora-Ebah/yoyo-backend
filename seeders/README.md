# 🌱 Seeders YoYo (JavaScript)

Ce dossier contient les seeders JavaScript pour initialiser la base de données avec des données de base.

## 📁 Structure

```
yoyo-api/
├── seed.js                    # Script principal à la racine
├── seeders/
│   ├── index.js              # Point d'entrée principal
│   ├── category.seeder.js    # Seeder pour les catégories
│   ├── plan.seeder.js        # Seeder pour les plans d'abonnement
│   └── README.md            # Cette documentation
└── package.json              # Scripts NPM mis à jour
```

## 🚀 Utilisation

### Scripts NPM disponibles

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

- **Alimentation** - Restaurants, épiceries, supermarchés
- **Mode & Beauté** - Vêtements, cosmétiques, accessoires
- **Électronique** - Smartphones, ordinateurs, gadgets
- **Santé & Bien-être** - Pharmacies, cliniques, salles de sport
- **Transport** - Taxi, bus, location de véhicules
- **Divertissement** - Cinémas, théâtres, parcs d'attractions
- **Éducation** - Écoles, universités, formations
- **Services Financiers** - Banques, assurances, microfinance
- **Immobilier** - Agences immobilières, location
- **Automobile** - Concessionnaires, garages, pièces
- **Voyage & Tourisme** - Agences de voyage, hôtels
- **Sport & Fitness** - Équipements sportifs, salles de sport
- **Art & Culture** - Galeries, musées, expositions
- **Jardinage & Bricolage** - Outils, plantes, matériaux
- **Animaux & Vétérinaires** - Soins vétérinaires, animaleries
- **Technologie & Informatique** - Services IT, développement
- **Événements & Cérémonies** - Organisation d'événements
- **Loisirs & Hobbies** - Jeux, puzzles, collections
- **Services à Domicile** - Ménage, réparation, livraison
- **Autres** - Autres catégories

### Plans d'abonnement (6 plans)

#### 1. **Gratuit** (0 XOF)
- 7 jours d'essai
- 5 scans/jour, 50 scans/mois
- 0% de réduction
- Cashback max: 100 XOF

#### 2. **Basic** (2 500 XOF/mois)
- 20 scans/jour, 200 scans/mois
- 5% de réduction
- Cashback max: 500 XOF
- 4 catégories de partenaires

#### 3. **Premium** (5 000 XOF/mois) ⭐ *Populaire*
- 50 scans/jour, 500 scans/mois
- 10% de réduction
- Cashback max: 2 000 XOF
- 6 catégories de partenaires
- Fonctionnalités avancées

#### 4. **Gold** (10 000 XOF/mois)
- 100 scans/jour, 1 000 scans/mois
- 15% de réduction
- Cashback max: 5 000 XOF
- 8 catégories de partenaires
- Support VIP

#### 5. **Premium Annuel** (50 000 XOF/an) ⭐ *Économie*
- Même que Premium mais engagement annuel
- Économie de 10 000 XOF (2 mois gratuits)
- Renouvellement automatique

#### 6. **Entreprise** (25 000 XOF/mois)
- 200 scans/jour, 2 000 scans/mois
- 12% de réduction
- Cashback max: 10 000 XOF
- Gestion multi-utilisateurs
- API d'intégration

## 🔧 Fonctionnalités

### ✅ Sécurité
- Vérification des doublons avant création
- Gestion d'erreurs robuste
- Logging complet des opérations

### ✅ Flexibilité
- Exécution sélective (catégories ou plans)
- Mode nettoyage pour supprimer les données
- Scripts NPM et script direct

### ✅ Monitoring
- Logs détaillés avec compteurs
- Messages de statut en temps réel
- Gestion des erreurs par élément

## 🛠️ Développement

### Ajouter un nouveau seeder

1. Créer le fichier `mon-seeder.js` dans le dossier `seeders/`
2. Implémenter les méthodes `seed()` et `clean()`
3. Ajouter au `SeederRunner` dans `index.js`
4. Créer les scripts NPM correspondants

### Structure d'un seeder

```javascript
class MonSeeder {
  constructor() {
    this.service = new MonService();
    this.seederLabel = 'MonSeeder';
  }

  getData() {
    return [
      // Données à seed
    ];
  }

  async seed() {
    // Logique de seeding
  }

  async clean() {
    // Logique de nettoyage
  }
}

module.exports = { MonSeeder };
```

## 📝 Logs

Les seeders génèrent des logs détaillés :

```
🌱 Démarrage des seeders...

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
```

## ⚠️ Précautions

- **Sauvegarde** : Toujours sauvegarder la base de données avant d'exécuter les seeders
- **Environnement** : Vérifier que vous êtes sur le bon environnement (dev/test/prod)
- **Doublons** : Les seeders vérifient les doublons, mais soyez prudent
- **Dépendances** : Exécuter les catégories avant les plans (dépendances)

## 🚀 Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer la base de données dans .env

# 3. Exécuter les seeders
npm run seed

# 4. Vérifier les données dans la base
```

## 🔄 Workflow de développement

```bash
# Nettoyer et re-seeder
npm run seed:clean && npm run seed

# Seeder des catégories seulement
npm run seed:categories

# Seeder des plans seulement
npm run seed:plans
```
