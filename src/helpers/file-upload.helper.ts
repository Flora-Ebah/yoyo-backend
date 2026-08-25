import coddyger from 'coddyger';
import fs from 'fs';
import multer from 'fastify-multer';
import path from 'path';
import mime from 'mime-types';

interface FileUploadOptions {
  maxSize: number;
  allowedExtensions: string[];
}

const uploadPath: any = path.join(coddyger.root() + '/src/public/uploads/');

export class FileUpload {
  static uploadPath: any = path.join(coddyger.root() + '/src/public/uploads/');
  private upload: any;
  private options: FileUploadOptions;

  constructor(options: any) {
    this.options = options;
    this.upload = multer({
      dest: uploadPath,
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

  static save(file: any) {
		return new Promise((resolve, reject) => {
			const tempPath = file.path;
			let fileExt = this.buildExt(file.mimetype);
			let fullFilePath = uploadPath + file.filename + '.' + fileExt;
			let filename: string = file.filename + '.' + fileExt;

			fs.rename(tempPath, fullFilePath, async (err) => {
				if (err) reject(err);

				if (await coddyger.file.exists(tempPath)) {
					fs.rmdirSync(tempPath);
				}
				resolve({ filename, fullFilePath });
			});
		}).catch((error) => {
			return { error: true, data: error };
		});
	}
	static buildExt(mimetype: string) {
		return mime.extension(mimetype);
	}
}
