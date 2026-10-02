import fs from 'fs';
import os from 'os';
import multer from 'fastify-multer';
import path from 'path';
import mime from 'mime-types';
import { isPublicKey, storage, storageDriver, uploadPath } from '../services/storage/storage.service';

interface FileUploadOptions {
  maxSize: number;
  allowedExtensions: string[];
}

export { uploadPath };

/**
 * Dossier de réception de multer. Les fichiers n'y restent que le temps d'être contrôlés puis
 * confiés au stockage (`storage.put`) : ils ne sont jamais servis depuis là.
 */
export const tempUploadPath: string = path.join(os.tmpdir(), 'yoyo-uploads');

/** Extensions dont `mime-types` ne donne pas la forme attendue par les apps. */
const EXTENSION_OVERRIDES: Record<string, string> = {
  'video/quicktime': 'mov'
};

export class FileUpload {
  static uploadPath: string = uploadPath;
  private upload: any;
  private options: FileUploadOptions;

  constructor(options: any) {
    this.options = options;
    fs.mkdirSync(tempUploadPath, { recursive: true });
    this.upload = multer({
      dest: tempUploadPath,
      limits: { fileSize: this.options.maxSize },
      fileFilter: this.fileFilter.bind(this),
    });
  }

  private fileFilter(req: any, file: any, cb: any):any {
    const ext = path.extname(file.originalname).toLowerCase();
    if (this.options.allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb({
        error: true,
        message: 'Type de fichier non autorisé'
      });
    }
  }

  public single(fieldName: string, maxCount: number = 1) {
    return this.upload.array(fieldName, maxCount);
  }

  public multipleFiles(fieldName: string, maxCount: number): any {
    return this.upload.array(fieldName, maxCount);
  }

  /**
   * Confie un fichier reçu par multer au stockage et supprime le temporaire.
   * Renvoie la clé (= nom de fichier stocké en base et servi par `/file/`).
   */
  static async save(file: any, contentType: string = FileUpload.contentTypeOf(file)): Promise<{ filename: string } | { error: true; data: any }> {
    try {
      const filename: string = `${file.filename}.${this.buildExt(contentType)}`;
      await storage.put(file.path, filename, contentType);
      return { filename };
    } catch (error) {
      return { error: true, data: error };
    } finally {
      await FileUpload.discard(file);
    }
  }

  /** Supprime le temporaire multer (sans erreur s'il a déjà disparu). */
  static async discard(file: any): Promise<void> {
    if (file?.path) await fs.promises.rm(file.path, { force: true });
  }

  /**
   * Type réel d'un fichier reçu. Une extension vidéo l'emporte sur le type déclaré : les versions
   * installées de l'app Pro déclarent tout envoi comme `image/jpeg`, et une vidéo ainsi étiquetée
   * échapperait sinon au contrôle de durée.
   */
  static contentTypeOf(file: any): string {
    const byName = mime.lookup(file?.originalname || '');
    if (byName && byName.startsWith('video/')) return byName;
    return file?.mimetype || byName || 'application/octet-stream';
  }

  static isVideo(contentType: string): boolean {
    return contentType.startsWith('video/');
  }

  static buildExt(mimetype: string): string {
    return EXTENSION_OVERRIDES[mimetype] ?? (mime.extension(mimetype) || 'bin');
  }
}

/**
 * Répond avec un fichier PUBLIC (clé plate) : depuis le disque s'il y est encore (pilote local, ou
 * fichier pas encore migré), sinon par redirection vers une URL S3 signée.
 * Les clés sous `kyc/` ou contenant un chemin sont refusées ici par construction.
 */
export const sendStoredFile = async (reply: any, key: string): Promise<any> => {
  const notFound = () => reply.code(404).send({ message: 'Fichier introuvable', data: null });

  // Les médias publics sont embarqués (<img>/<video>) depuis l'admin web, une AUTRE origine.
  // Helmet pose globalement `Cross-Origin-Resource-Policy: same-origin` (hook onRequest), ce qui
  // fait bloquer le média par le navigateur : net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin.
  // On écrase cet en-tête UNIQUEMENT pour cette route de fichiers (le handler s'exécute après le
  // hook onRequest de helmet, donc notre valeur gagne) ; le reste de l'API garde sa politique.
  // Posé avant tout retour pour couvrir aussi bien la réponse 302 que l'envoi direct du fichier.
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin');

  if (!isPublicKey(key)) return notFound();

  if (await storage.localPath(key)) return reply.sendFile(key, uploadPath);

  if (storageDriver() === 's3') {
    const url = await storage.signedUrl(key);
    if (!url) return notFound();
    // La redirection peut être gardée en cache moins longtemps que l'URL signée n'est valable.
    reply.header('Cache-Control', 'private, max-age=3000');
    return reply.redirect(302, url);
  }

  return notFound();
};
