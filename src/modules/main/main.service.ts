import coddyger from 'coddyger'
import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export class MainService {
	static sampleMethod(apikey: string, controllerLabel: string) {
		return new Promise(async (resolve, reject) => {

		}).catch((err: any) => {
			return coddyger.catchReturn(err, 'MainService', 'sampleMethod');
		});
	}

	static async extractTextFromFile(filePath: string): Promise<string> {
		const ext = path.extname(filePath).toLowerCase();
		if (ext === '.pdf') {
			const dataBuffer = await fs.readFile(filePath);
			const data = await pdf(dataBuffer);
			return data.text;
		} else if (ext === '.docx') {
			const result = await mammoth.extractRawText({ path: filePath });
			return result.value;
		} else {
			throw new Error('Unsupported file format');
		}
	}
}
