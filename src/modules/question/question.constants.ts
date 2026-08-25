const CATEGORIES = {
    PERSONNEL: 'personnel',
    FAMILLE: 'famille',
    EDUCATION: 'education',
    TRAVAIL: 'travail',
    ENFANCE: 'enfance',
    LOISIRS: 'loisirs',
    ANIMAUX: 'animaux'
} as const;

export const QuestionConstants = {
    CATEGORIES,
    STATUS: {
        ACTIVE: 'active',
        INACTIVE: 'inactive',
        DRAFT: 'draft',
        REMOVED: 'removed'
    } as const,

    SECURITY_LEVELS: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high'
    } as const,

    CATEGORY_GROUPS: {
        PERSONAL: [CATEGORIES.PERSONNEL, CATEGORIES.FAMILLE, CATEGORIES.ENFANCE] as const,
        PROFESSIONAL: [CATEGORIES.EDUCATION, CATEGORIES.TRAVAIL] as const,
        OTHER: [CATEGORIES.LOISIRS, CATEGORIES.ANIMAUX] as const
    } as const
} as const;

export type QuestionCategory = typeof QuestionConstants.CATEGORIES[keyof typeof QuestionConstants.CATEGORIES];
export type QuestionStatus = typeof QuestionConstants.STATUS[keyof typeof QuestionConstants.STATUS];
export type SecurityLevel = typeof QuestionConstants.SECURITY_LEVELS[keyof typeof QuestionConstants.SECURITY_LEVELS]; 