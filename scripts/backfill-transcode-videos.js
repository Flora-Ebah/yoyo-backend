/**
 * Rattrapage du ré-encodage « diffusion mobile » des vidéos de boutiques déjà en ligne.
 *
 * Contexte : depuis le 02/11/2026, toute vidéo envoyée est ré-encodée à l'upload en H.264 720p à
 * débit plafonné (~1,5 Mbit/s), en MP4 « faststart » (voir src/helpers/video.helper.ts →
 * transcodeForStreaming et src/modules/main/main.controller.ts). Les vidéos antérieures sont restées
 * dans leur qualité d'origine (1080p/4K, HEVC, 15 à 50 Mbit/s) : lourdes à télécharger, elles font
 * « ramer » la lecture sur réseau mobile.
 *
 * Pour chaque boutique (collection `partners`) portant une `video`, le script télécharge la vidéo
 * depuis le stockage (local ou S3), l'analyse et, si elle n'est pas déjà au profil de diffusion, la
 * ré-encode puis la RÉ-UPLOADE sous la MÊME clé (écrasement, type `video/mp4`). Le nom en base ne
 * change donc pas — ni l'aperçu `videoPoster`, ni le journal de modération. Une clé `.mov` contient
 * alors un MP4 : les lecteurs iOS/Android identifient le format au contenu, pas à l'extension.
 *
 * Idempotent : une vidéo déjà conforme est ignorée (`needsTranscode`), relancer le script est sans
 * effet sur ce qui a été traité.
 *
 * Le profil d'encodage est celui de l'API : le script charge `build/helpers/video.helper.js`.
 *
 * Prérequis :
 *   - `yarn build` effectué (déjà le cas dans l'image Docker) ;
 *   - ffmpeg / ffprobe dans le PATH (présents dans l'image Docker) ;
 *   - exécuter depuis le serveur qui a accès au stockage, avec les mêmes variables que l'API :
 *     STORAGE_DRIVER, S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, DB_URI (ou MONGODB_URI),
 *     DB_NAME.
 *
 * Le ré-encodage consomme du CPU (≈ 10 à 60 s par vidéo, 2 cœurs) : préférer une heure creuse.
 *
 * DRY-RUN par défaut : analyse et liste ce qui serait ré-encodé, sans rien écrire.
 *
 * Usage :
 *   node scripts/backfill-transcode-videos.js                     # DRY-RUN : analyse seulement
 *   node scripts/backfill-transcode-videos.js --limit 3           # DRY-RUN sur un échantillon
 *   node scripts/backfill-transcode-videos.js --limit 3 --apply   # traite 3 vidéos réellement
 *   node scripts/backfill-transcode-videos.js --apply             # traite toutes les vidéos
 */

require('../load-env');

const mongoose = require('mongoose');
const fs = require('fs');
const os = require('os');
const path = require('path');

let videoHelper;
try {
  videoHelper = require('../build/helpers/video.helper');
} catch (error) {
  console.error('❌ build/helpers/video.helper.js introuvable : lancez `yarn build` avant ce script.');
  process.exit(1);
}
const { probeVideo, needsTranscode, transcodeForStreaming } = videoHelper;

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

/**
 * Clé publique « plate » (miroir de `isPublicKey`) : pas de dossier, pas de `kyc/`, jeu de
 * caractères fermé. `partners.video` est une chaîne libre en base : sans ce contrôle, une valeur
 * forgée ferait lire ou écraser un autre fichier (pièce KYC, fichier hors du dossier d'upload).
 */
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$/;
const isPublicKey = (key) => typeof key === 'string' && PUBLIC_KEY_PATTERN.test(key) && !key.includes('..');

/** Chemin disque d'une clé (pilote local), garanti à l'intérieur du dossier d'upload. */
const localFile = (key) => {
  const full = path.resolve(uploadPath, key);
  if (!full.startsWith(path.resolve(uploadPath) + path.sep)) throw new Error(`Clé de stockage invalide : ${key}`);
  return full;
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
  await fs.promises.copyFile(localFile(key), dest);
}

/** Ré-uploade `src` sous la clé `key` (écrase l'existant). */
async function upload(src, key) {
  if (storageDriver() === 's3') {
    const { Upload } = require('@aws-sdk/lib-storage');
    await new Upload({
      client: s3(),
      params: { Bucket: bucket(), Key: key, Body: fs.createReadStream(src), ContentType: 'video/mp4' }
    }).done();
    return;
  }
  await fs.promises.copyFile(src, localFile(key));
}

// --- Programme principal ------------------------------------------------------------------------

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const mo = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

const describe = (probe) =>
  `${probe.video.codec} ${probe.video.width}×${probe.video.height} ` +
  `${Math.round(probe.video.fps)} i/s ${(probe.bitRate / 1e6).toFixed(1)} Mbit/s`;

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArg = argValue('--limit');
  const limit = limitArg ? Number(limitArg) : 0;
  const mongoUri = process.env.DB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || 'yoyo';

  await mongoose.connect(mongoUri, { dbName });
  console.log(
    `📡 Connecté à ${dbName} — stockage : ${storageDriver()} — mode : ${apply ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'}`
  );

  const partners = mongoose.connection.collection('partners');
  const filter = {
    video: { $exists: true, $nin: [null, ''] },
    status: { $nin: ['removed', 'archived'] }
  };

  let cursor = partners.find(filter, { projection: { _id: 1, name: 1, video: 1 } });
  if (limit > 0) cursor = cursor.limit(limit);
  const rows = await cursor.toArray();
  const total = await partners.countDocuments(filter);
  console.log(
    `   • ${total} boutique(s) avec vidéo au total${limit > 0 ? ` (échantillon limité à ${rows.length})` : ''}\n`
  );

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'yoyo-transcode-'));
  let transcoded = 0;
  let skipped = 0;
  let before = 0;
  let after = 0;
  const failures = [];

  for (const p of rows) {
    const key = p.video;
    const label = `${p.name || '(sans nom)'} [${p._id}] → ${key}`;
    const inPath = path.join(tmpDir, `${p._id}-in`);
    const outPath = path.join(tmpDir, `${p._id}-720.mp4`);
    if (!isPublicKey(key)) {
      failures.push({ id: p._id, key, message: 'clé non publique ignorée' });
      console.error(`   ⛔ clé non publique ignorée — ${label}`);
      continue;
    }
    try {
      await download(key, inPath);
      const probe = await probeVideo(inPath);
      const size = (await fs.promises.stat(inPath)).size;

      if (!needsTranscode(probe)) {
        skipped += 1;
        console.log(`   ⏭️  déjà conforme — ${label} (${describe(probe)}, ${mo(size)})`);
        continue;
      }
      if (!apply) {
        transcoded += 1;
        console.log(`   🔎 à ré-encoder — ${label} (${describe(probe)}, ${mo(size)})`);
        continue;
      }

      await transcodeForStreaming(inPath, outPath);
      const newSize = (await fs.promises.stat(outPath)).size;
      await upload(outPath, key);
      transcoded += 1;
      before += size;
      after += newSize;
      console.log(`   ✅ ${label} : ${describe(probe)}, ${mo(size)} → ${mo(newSize)}`);
    } catch (error) {
      failures.push({ id: p._id, key, message: error && error.message });
      console.error(`   ❌ ${label} : ${error && error.message}`);
    } finally {
      await fs.promises.rm(inPath, { force: true });
      await fs.promises.rm(outPath, { force: true });
    }
  }

  await fs.promises.rm(tmpDir, { recursive: true, force: true });

  if (apply) {
    console.log(`\n🏁 Terminé : ${transcoded} ré-encodée(s), ${skipped} déjà conforme(s), ${failures.length} échec(s).`);
    if (transcoded > 0) console.log(`   Poids total : ${mo(before)} → ${mo(after)}`);
  } else {
    console.log(`\nℹ️  Dry-run : ${transcoded} à ré-encoder, ${skipped} déjà conforme(s), ${failures.length} échec(s).`);
    console.log('   Relancez avec --apply pour ré-encoder et ré-uploader.');
  }
  failures.forEach((f) => console.log(`     - ${f.key} [${f.id}] : ${f.message}`));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Échec du rattrapage :', err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
