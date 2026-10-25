import { randomInt } from 'crypto';

/** Alphabet des codes lisibles (Excel n°13) : sans I, O, 0 ni 1, faciles à dicter et à saisir. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Suite aléatoire de `length` caractères de `CODE_ALPHABET` (tirage cryptographique). */
export const randomCode = (length: number): string => {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
};

/**
 * Clé de comparaison d'un numéro de téléphone : ses 10 derniers chiffres. « +225 07 08 09 10 11 »,
 * « 0707080910 11 » et « 002250708091011 » donnent la même clé.
 */
export const phoneKey = (phone?: string | null): string => String(phone ?? '').replace(/\D/g, '').slice(-10);
