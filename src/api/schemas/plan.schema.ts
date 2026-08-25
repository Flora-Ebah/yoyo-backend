import Joi from 'joi';

/**
 * Schéma de validation pour la création d'un plan
 */
export const createPlanSchema = Joi.object({
  name: Joi.string()
    .required()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'Le nom du plan est requis',
      'string.min': 'Le nom du plan doit contenir au moins {#limit} caractères',
      'string.max': 'Le nom du plan ne peut pas dépasser {#limit} caractères',
      'any.required': 'Le nom du plan est requis'
    }),
  description: Joi.string()
    .required()
    .min(10)
    .max(1000)
    .messages({
      'string.empty': 'La description du plan est requise',
      'string.min': 'La description du plan doit contenir au moins {#limit} caractères',
      'string.max': 'La description du plan ne peut pas dépasser {#limit} caractères',
      'any.required': 'La description du plan est requise'
    }),
  price: Joi.number()
    .required()
    .min(0)
    .messages({
      'number.base': 'Le prix doit être un nombre',
      'number.min': 'Le prix ne peut pas être négatif',
      'any.required': 'Le prix est requis'
    }),
  currency: Joi.string()
    .valid('XOF', 'EUR', 'USD', 'GBP')
    .default('XOF')
    .messages({
      'string.base': 'La devise doit être une chaîne de caractères',
      'any.only': 'La devise doit être l\'une des suivantes: XOF, EUR, USD, GBP'
    }),
  durationDays: Joi.number()
    .integer()
    .min(1)
    .default(30)
    .messages({
      'number.base': 'La durée doit être un nombre',
      'number.integer': 'La durée doit être un nombre entier',
      'number.min': 'La durée doit être d\'au moins 1 jour'
    }),
  discountPercentage: Joi.number()
    .required()
    .min(1)
    .max(100)
    .messages({
      'number.base': 'Le pourcentage de réduction doit être un nombre',
      'number.min': 'Le pourcentage de réduction doit être d\'au moins 1%',
      'number.max': 'Le pourcentage de réduction ne peut pas dépasser 100%',
      'any.required': 'Le pourcentage de réduction est requis'
    }),
  maxScansPerDay: Joi.number()
    .integer()
    .min(1)
    .default(5)
    .messages({
      'number.base': 'Le nombre maximum de scans par jour doit être un nombre',
      'number.integer': 'Le nombre maximum de scans par jour doit être un nombre entier',
      'number.min': 'Le nombre maximum de scans par jour doit être d\'au moins 1'
    }),
  maxScansPerMonth: Joi.number()
    .integer()
    .min(1)
    .default(100)
    .messages({
      'number.base': 'Le nombre maximum de scans par mois doit être un nombre',
      'number.integer': 'Le nombre maximum de scans par mois doit être un nombre entier',
      'number.min': 'Le nombre maximum de scans par mois doit être d\'au moins 1'
    }),
  features: Joi.array()
    .items(Joi.string())
    .required()
    .min(1)
    .messages({
      'array.base': 'Les fonctionnalités doivent être une liste',
      'array.min': 'Au moins une fonctionnalité est requise',
      'any.required': 'Les fonctionnalités sont requises'
    }),
  partnerCategories: Joi.array()
    .items(Joi.string())
    .default(['all'])
    .messages({
      'array.base': 'Les catégories de partenaires doivent être une liste'
    }),
  maxCashbackAmount: Joi.number()
    .min(0)
    .messages({
      'number.base': 'Le montant maximum de cashback doit être un nombre',
      'number.min': 'Le montant maximum de cashback ne peut pas être négatif'
    }),
  isPopular: Joi.boolean()
    .default(false),
  isActive: Joi.boolean()
    .default(true),
  trialDays: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .messages({
      'number.base': 'Le nombre de jours d\'essai doit être un nombre',
      'number.integer': 'Le nombre de jours d\'essai doit être un nombre entier',
      'number.min': 'Le nombre de jours d\'essai ne peut pas être négatif'
    }),
  metadata: Joi.object()
    .optional()
});

/**
 * Schéma de validation pour la mise à jour d'un plan
 */
export const updatePlanSchema = Joi.object({
  _id: Joi.string()
    .required()
    .messages({
      'string.empty': 'L\'ID du plan est requis',
      'any.required': 'L\'ID du plan est requis'
    }),
  name: Joi.string()
    .min(2)
    .max(100)
    .messages({
      'string.min': 'Le nom du plan doit contenir au moins {#limit} caractères',
      'string.max': 'Le nom du plan ne peut pas dépasser {#limit} caractères'
    }),
  description: Joi.string()
    .min(10)
    .max(1000)
    .messages({
      'string.min': 'La description du plan doit contenir au moins {#limit} caractères',
      'string.max': 'La description du plan ne peut pas dépasser {#limit} caractères'
    }),
  price: Joi.number()
    .min(0)
    .messages({
      'number.base': 'Le prix doit être un nombre',
      'number.min': 'Le prix ne peut pas être négatif'
    }),
  currency: Joi.string()
    .valid('XOF', 'EUR', 'USD', 'GBP')
    .messages({
      'string.base': 'La devise doit être une chaîne de caractères',
      'any.only': 'La devise doit être l\'une des suivantes: XOF, EUR, USD, GBP'
    }),
  durationDays: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base': 'La durée doit être un nombre',
      'number.integer': 'La durée doit être un nombre entier',
      'number.min': 'La durée doit être d\'au moins 1 jour'
    }),
  discountPercentage: Joi.number()
    .min(1)
    .max(100)
    .messages({
      'number.base': 'Le pourcentage de réduction doit être un nombre',
      'number.min': 'Le pourcentage de réduction doit être d\'au moins 1%',
      'number.max': 'Le pourcentage de réduction ne peut pas dépasser 100%'
    }),
  maxScansPerDay: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base': 'Le nombre maximum de scans par jour doit être un nombre',
      'number.integer': 'Le nombre maximum de scans par jour doit être un nombre entier',
      'number.min': 'Le nombre maximum de scans par jour doit être d\'au moins 1'
    }),
  maxScansPerMonth: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base': 'Le nombre maximum de scans par mois doit être un nombre',
      'number.integer': 'Le nombre maximum de scans par mois doit être un nombre entier',
      'number.min': 'Le nombre maximum de scans par mois doit être d\'au moins 1'
    }),
  features: Joi.array()
    .items(Joi.string())
    .min(1)
    .messages({
      'array.base': 'Les fonctionnalités doivent être une liste',
      'array.min': 'Au moins une fonctionnalité est requise'
    }),
  partnerCategories: Joi.array()
    .items(Joi.string())
    .messages({
      'array.base': 'Les catégories de partenaires doivent être une liste'
    }),
  maxCashbackAmount: Joi.number()
    .min(0)
    .messages({
      'number.base': 'Le montant maximum de cashback doit être un nombre',
      'number.min': 'Le montant maximum de cashback ne peut pas être négatif'
    }),
  isPopular: Joi.boolean(),
  isActive: Joi.boolean(),
  trialDays: Joi.number()
    .integer()
    .min(0)
    .messages({
      'number.base': 'Le nombre de jours d\'essai doit être un nombre',
      'number.integer': 'Le nombre de jours d\'essai doit être un nombre entier',
      'number.min': 'Le nombre de jours d\'essai ne peut pas être négatif'
    }),
  metadata: Joi.object()
    .optional()
}); 