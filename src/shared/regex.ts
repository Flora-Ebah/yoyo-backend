/** Échappe une saisie utilisateur avant de l'injecter dans un `$regex` Mongo (ni motif, ni ReDoS). */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
