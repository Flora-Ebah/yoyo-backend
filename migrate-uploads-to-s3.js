/**
 * Migration des fichiers du disque (src/public/uploads) vers le bucket S3.
 *
 *   node migrate-uploads-to-s3.js           → simulation : affiche ce qui serait fait, n'écrit rien
 *   node migrate-uploads-to-s3.js --apply   → exécute
 *
 * - Fichiers publics (images, vidéos…) : copiés sous la MÊME clé. La copie locale est conservée :
 *   `GET /file/` la sert tant qu'elle existe, elle sera archivée plus tard.
 * - Pièces KYC (référencées par une certification) : copiées sous `kyc/<nom>` et jamais sous une
 *   clé publique ; la copie locale est supprimée une fois l'objet vérifié dans le bucket.
 *
 * Idempotent : un objet déjà présent dans le bucket n'est pas renvoyé. Relançable sans risque.
 * Variables requises : DB_URI, DB_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET.
 */
require('./load-env');

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const mime = require('mime-types');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const APPLY = process.argv.includes('--apply');
const UPLOADS = path.join(__dirname, 'src', 'public', 'uploads');
const KYC_PREFIX = 'kyc/';
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$/;

const bucket = (process.env.S3_BUCKET || '').trim();
const s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-north-1' });

const existsInBucket = async (key) => {
	try {
		await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
		return true;
	} catch (error) {
		if (error.name === 'NotFound' || (error.$metadata && error.$metadata.httpStatusCode === 404)) return false;
		throw error;
	}
};

const upload = (file, key) =>
	new Upload({
		client: s3,
		params: {
			Bucket: bucket,
			Key: key,
			Body: fs.createReadStream(file),
			ContentType: mime.lookup(file) || 'application/octet-stream'
		}
	}).done();

const main = async () => {
	if (!bucket) throw new Error('S3_BUCKET manquant');
	if (!fs.existsSync(UPLOADS)) throw new Error(`Dossier introuvable : ${UPLOADS}`);

	console.log(`${APPLY ? '🚚 MIGRATION' : '🔎 SIMULATION (ajouter --apply pour exécuter)'} → s3://${bucket}`);

	// Noms des pièces KYC : elles ne doivent jamais atterrir sous une clé publique.
	await mongoose.connect(process.env.DB_URI || 'mongodb://localhost:27017', { dbName: process.env.DB_NAME || 'yoyo' });
	const kycNames = new Set();
	const certifications = mongoose.connection.db.collection('certifications').find({}, { projection: { documentFile: 1 } });
	for await (const certification of certifications) {
		for (const name of certification.documentFile || []) kycNames.add(name);
	}
	await mongoose.disconnect();
	console.log(`   ${kycNames.size} pièce(s) KYC référencée(s) en base`);

	const report = { public: 0, kyc: 0, skipped: 0, ignored: [], failed: [] };

	// Pièces déjà rangées sous uploads/kyc/ (pilote local) + fichiers à la racine.
	const entries = [
		...fs.readdirSync(UPLOADS, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => ({ name: e.name, dir: UPLOADS })),
		...(fs.existsSync(path.join(UPLOADS, 'kyc'))
			? fs.readdirSync(path.join(UPLOADS, 'kyc')).map((name) => ({ name, dir: path.join(UPLOADS, 'kyc'), forceKyc: true }))
			: [])
	];

	for (const { name, dir, forceKyc } of entries) {
		const file = path.join(dir, name);
		if (!PUBLIC_KEY_PATTERN.test(name)) {
			report.ignored.push(name);
			continue;
		}

		const isKyc = forceKyc || kycNames.has(name);
		const key = isKyc ? KYC_PREFIX + name : name;

		try {
			if (await existsInBucket(key)) {
				report.skipped++;
			} else {
				if (APPLY) await upload(file, key);
				isKyc ? report.kyc++ : report.public++;
			}

			// Une pièce KYC ne reste pas sur le disque, où `/file/` pourrait encore la servir.
			if (isKyc && APPLY) {
				if (!(await existsInBucket(key))) throw new Error('objet absent après envoi');
				fs.rmSync(file, { force: true });
			}
		} catch (error) {
			report.failed.push(`${name} : ${error.message}`);
		}
	}

	const verb = APPLY ? 'envoyé(s)' : 'à envoyer';
	console.log(`\n✅ ${report.public} fichier(s) public(s) ${verb}`);
	console.log(`🔒 ${report.kyc} pièce(s) KYC ${verb} sous ${KYC_PREFIX}${APPLY ? ' (copies locales supprimées)' : ''}`);
	console.log(`⏭️  ${report.skipped} déjà présent(s) dans le bucket`);
	if (report.ignored.length) console.log(`⚠️  ${report.ignored.length} nom(s) ignoré(s) : ${report.ignored.join(', ')}`);
	if (report.failed.length) {
		console.log(`❌ ${report.failed.length} échec(s) :\n   ${report.failed.join('\n   ')}`);
		process.exitCode = 1;
	}
};

main().catch((error) => {
	console.error('❌ Migration interrompue :', error.message);
	process.exit(1);
});
