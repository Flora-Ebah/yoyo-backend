/**
 * Journal d'audit des anonymisations (DCP/RGPD).
 *
 * Trace, de façon **non nominative**, chaque acte d'anonymisation d'un compte : quel compte
 * (`clientId`, un identifiant technique), quand, et par quel déclencheur (cron automatique ou
 * administrateur). Aucune donnée personnelle n'est stockée ici — l'objectif est de pouvoir prouver
 * qu'une suppression a bien eu lieu sans réintroduire les PII qu'on vient justement de retirer.
 */
export interface IAnonymizationLog {
  _id?: string;
  /** Identifiant technique du compte anonymisé (non nominatif). */
  clientId: string;
  /** Origine de l'anonymisation. */
  trigger: 'cron' | 'admin';
  /** Administrateur à l'origine (uniquement pour `trigger = 'admin'`). */
  performedBy?: any;
  status?: string;
}
