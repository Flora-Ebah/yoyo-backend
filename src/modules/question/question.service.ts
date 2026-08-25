import { IQuestion, QuestionSet } from './question.model';
import coddyger, { IData } from 'coddyger';
import { QuestionConstants, SecurityLevel } from './question.constants';

export class QuestionService {
	private readonly dao: IData<IQuestion>;

	constructor() {
		this.dao = new QuestionSet();
	}

	async checkQuestionExists(questionText: string, excludeId?: string) {
		if (excludeId) {
			const ownQuestion = await this.dao.exist({ $and: [{ questionText }, { _id: excludeId }] });
			if (ownQuestion) return false;
		}
		return await this.dao.exist({ questionText });
	}

	async generateSlug(): Promise<string> {
		const theLast: any = await this.dao.selectLatest();
		return coddyger.buildSlug('QST', theLast ? theLast.slug : null);
	}

	validateQuestion(question: IQuestion): string | null {
		if (!question.questionText || question.questionText.trim().length < 3) {
			return 'La question doit contenir au moins 3 caractères';
		}
		if (question.languageCode && question.languageCode.trim().length > 10) {
			return 'Le code de langue ne doit pas dépasser 10 caractères';
		}
		if (!question.category) {
			return 'La catégorie est requise';
		}
		return null;
	}

	calculateSecurityLevel(question: IQuestion): SecurityLevel {
		let score = 0;

		// Critère 1: Longueur minimale de réponse requise
		if (question.minAnswerLength) {
			if (question.minAnswerLength >= 8) score += 2;
			else if (question.minAnswerLength >= 5) score += 1;
		}

		// Critère 2: Présence d'une expression régulière de validation
		if (question.validationRegex) score += 2;

		// Critère 3: Catégorie de la question
		const category = question.category!;
		if (QuestionConstants.CATEGORY_GROUPS.PERSONAL.some(c => c === category)) score += 2;
		else if (QuestionConstants.CATEGORY_GROUPS.PROFESSIONAL.some(c => c === category)) score += 1;

		// Critère 4: Personnalisation possible
		if (!question.isCustomizable) score += 1;

		// Critère 5: Longueur maximale de réponse
		if (question.maxAnswerLength && question.maxAnswerLength >= 50) score += 1;

		// Détermination du niveau de sécurité
		if (score >= 6) return QuestionConstants.SECURITY_LEVELS.HIGH;
		if (score >= 3) return QuestionConstants.SECURITY_LEVELS.MEDIUM;
		return QuestionConstants.SECURITY_LEVELS.LOW;
	}
}
