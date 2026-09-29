/**
 * Interface du module Review (#14) — notation des marchands par les clients, via emoji.
 * Décisions (29/09) : le CLIENT note le MARCHAND ; échelle 1..5 (5 emojis) ; un seul vote par
 * (partner, client), modifiable. Un avis ≤ 2 est considéré « négatif ».
 */
export interface IReview {
  _id?: string;
  partner: any;
  client: any;
  /** Note emoji : 1 (très mauvais) .. 5 (excellent). */
  emoji: number;
  status?: string;
}
