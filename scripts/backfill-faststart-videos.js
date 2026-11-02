/**
 * Rattrapage « faststart » des vidéos de boutiques déjà en ligne.
 *
 * Contexte : avant le correctif à l'upload (voir src/helpers/video.helper.ts → remuxFaststart et
 * src/modules/main/main.controller.ts), les vidéos étaient stockées telles que fournies par le
 * téléphone, avec l'atome `moov` en FIN de fichier. Le lecteur du feed « Découvrir » doit alors
 * tout télécharger avant d'afficher la 1re image (écran noir puis apparition « d'un coup »). Le
 * remux « faststart » déplace le `moov` en tête et autorise la lecture progressive (type TikTok).
 *
 * Ce script rattrape l'existant : pour chaque boutique (collection `partners`) portant une `video`,
 * il télécharge la vidéo depuis le stockage (local ou S3), la remux en faststart avec ffmpeg
 * (`-c copy` : sans ré-encodage, sans perte, idempotent) et la RÉ-UPLOADE sous la MÊME clé
 * (écrasement). Le nom de fichier en base ne change donc pas, l'aperçu `videoPoster` non plus.
 *
 * Prérequis :
 *   - ffmpeg disponible dans le PATH (déjà présent dans l'image Docker).
 *   - Exécuter depuis le serveur qui a accès au stockage (pilote `local` : volume d'upload monté ;
 *     pilote `s3` : identifiants AWS + S3_BUCKET dans l'environnement). Mêmes variables que l'API :
 *     STORAGE_DRIVER, S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, DB_URI,
 *     DB_NAME.
 *
 * DRY-RUN par défaut : liste ce qui serait traité sans rien écrire.
 *
 * Usage :
 *   node scripts/backfill-faststart-videos.js                 # DRY-RUN : liste seulement
 *   node scripts/backfill-faststart-videos.js --limit 3       # DRY-RUN sur un échantillon
 *   node scripts/backfill-faststart-videos.js --limit 3 --apply   # traite 3 vidéos réellement
 *   node scripts/backfill-faststart-videos.js --apply         # traite toutes les vidéos
 */

require('../load-env');

const mongoose = require('mongoose');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);

// --- Configuration du stockage (miroir de src/services/storage/storage.service.ts) -------------

const uploadPath = path.join(__dirname, '..', 'src', 'public', 'uploads');

const storageDriver = () =>
  (process.env.STORAGE_DRIVER || '').split('#')[0].trim().toLowerCase() === 's3' ? 's3' : 'local';

const bucket = () => {
  const name = (process.env.S3_BUCKET || '').trim();
  if (!name) throw new Error('S3_BUCKET manquant alors que STORAGE_DRIVER=s3');
  return name;
};

let s3Client = null;
let s3Lib = null;
const s3 = () => {
  if (!s3Client) {
    s3Lib = require('@aws-sdk/client-s3');
    s3Client = new s3Lib.S3Client({ region: process.env.AWS_REGION || 'eu-north-1' });
  }
  return s3Client;
};

/** Télécharge l'objet `key` vers `dest` (fichier local temporaire). */
async function download(key, dest) {
  if (storageDriver() === 's3') {
    const res = await s3().send(new s3Lib.GetObjectCommand({ Bucket: bucket(), Key: key }));
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      res.Body.pipe(out);
      res.Body.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
    });
    return;
  }
  // Pilote local : la clé vit sous uploadPath (clé plate, pas de sous-dossier pour les vidéos).
  await fs.promises.copyFile(path.join(uploadPath, key), dest);
}

/** Ré-uploade `src` sous la clé `key` (écrase l'existant). */
async function upload(src, key, contentType) {
  if (storageDriver() === 's3') {
    const { Upload } = require('@aws-sdk/lib-storage');
    await new Upload({
      client: s3(),
      params: {
        Bucket: bucket(),
        Key: key,
        Body: fs.createReadStream(src),
        ContentType: contentType || 'video/mp4'
      }
    }).done();
    return;
  }
  await fs.promises.copyFile(src, path.join(uploadPath, key));
}

// --- Remux faststart ----------------------------------------------------------------------------

async function remuxFaststart(input, output) {
  // `-c copy` : copie sans ré-encodage ; seul l'ordre des atomes change. Idempotent et bénin.
  await run('ffmpeg', ['-v', 'error', '-i', input, '-c', 'copy', '-movflags', '+faststart', '-y', output], {
    timeout: 120000
  });
}

// --- Programme principal ------------------------------------------------------------------------

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArg = argValue('--limit');
  const limit = limitArg ? Number(limitArg) : 0;
  const mongoUri = process.env.DB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || 'yoyo';

  await mongoose.connect(mongoUri, { dbName });
  console.log(`📡 Connecté à ${dbName} — stockage : ${storageDriver()} — mode : ${apply ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'}`);

  const partners = mongoose.connection.collection('partners');

  // Boutiques avec une vidéo non vide, non supprimées.
  const filter = {
    video: { $exists: true, $nin: [null, ''] },
    status: { $nin: ['removed', 'archived'] }
  };

  let cursor = partners.find(filter, { projection: { _id: 1, name: 1, video: 1 } });
  if (limit > 0) cursor = cursor.limit(limit);
  const rows = await cursor.toArray();

  const total = await partners.countDocuments(filter);
  console.log(`   • ${total} boutique(s) avec vidéo au total${limit > 0 ? ` (échantillon limité à ${rows.length})` : ''}`);

  if (!apply) {
    rows.forEach((p) => console.log(`     - ${p.name || '(sans nom)'} [${p._id}] → ${p.video}`));
    console.log('\nℹ️  Dry-run terminé. Relancez avec --apply pour remux et ré-upload.');
    await mongoose.disconnect();
    return;
  }

  const tmpDir = path.join(os.tmpdir(), 'yoyo-faststart');
  await fs.promises.mkdir(tmpDir, { recursive: true });

  let done = 0;
  const failures = [];

  for (const p of rows) {
    const key = p.video;
    const inPath = path.join(tmpDir, `${p._id}-in.mp4`);
    const outPath = path.join(tmpDir, `${p._id}-fs.mp4`);
    try {
      await download(key, inPath);
      await remuxFaststart(inPath, outPath);
      await upload(outPath, key, 'video/mp4');
      done += 1;
      console.log(`   ✅ ${p.name || '(sans nom)'} [${p._id}] → ${key}`);
    } catch (error) {
      failures.push({ id: p._id, key, message: error && error.message });
      console.error(`   ❌ ${p.name || '(sans nom)'} [${p._id}] → ${key} : ${error && error.message}`);
    } finally {
      await fs.promises.rm(inPath, { force: true });
      await fs.promises.rm(outPath, { force: true });
    }
  }

  console.log(`\n🏁 Terminé : ${done} vidéo(s) traitée(s), ${failures.length} échec(s).`);
  if (failures.length > 0) {
    failures.forEach((f) => console.log(`     - ${f.key} [${f.id}] : ${f.message}`));
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Échec du rattrapage :', err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
