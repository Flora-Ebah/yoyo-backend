import { Schema } from 'joi';
import coddyger, { defines } from 'coddyger';

/**
 * Middleware de validation des données entrantes avec Joi
 * @param schema Schéma Joi à utiliser pour la validation
 * @returns Middleware de validation
 */
export const validateSchema = (schema: Schema) => {
  return (request: any, reply: any, done: any) => {
    try {
      // Valider les données en fonction de la méthode HTTP
      let dataToValidate;
      
      if (request.method === 'GET') {
        dataToValidate = request.query;
      } else if (request.method === 'POST' || request.method === 'PUT') {
        dataToValidate = request.body;
      } else if (request.method === 'DELETE') {
        dataToValidate = { ...request.params, ...request.query };
      } else {
        dataToValidate = { ...request.params, ...request.query, ...request.body };
      }
      
      // Valider les données avec le schéma Joi
      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        // Formater les erreurs de validation
        const errors = error.details.map(detail => ({
          message: detail.message,
          field: detail.path.join('.')
        }));
        
        // Renvoyer une réponse d'erreur
        return reply.status(defines.status.badRequest).send({
          status: defines.status.badRequest,
          message: errors[0].message,
          data: errors
        });
      }
      
      // Mettre à jour les données validées
      if (request.method === 'GET') {
        request.query = value;
      } else if (request.method === 'POST' || request.method === 'PUT') {
        request.body = value;
      }
      
      done();
    } catch (error) {
      console.error('Erreur de validation:', error);
      reply.status(defines.status.serverError).send({
        status: defines.status.serverError,
        message: 'Erreur lors de la validation des données',
        data: null
      });
    }
  };
}; 