/**
 * Script pour charger les variables d'environnement
 */

const path = require('path');
const fs = require('fs');

// Charger le fichier .env s'il existe
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('📄 Variables d\'environnement chargées depuis .env');
} else {
  console.log('⚠️  Fichier .env non trouvé, utilisation des variables système');
}
