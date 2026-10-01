/**
 * Construit un filtre Mongo de plage de dates sur un champ (défaut `createdAt`),
 * à fusionner dans les `params` d'un `dao.select`. Utilisé par les listes admin
 * pour rendre le filtre « Période » fonctionnel partout (from/to au format ISO).
 *
 * Renvoie `{}` si aucune borne → n'altère pas la requête.
 */
export function dateRangeFilter(
  from?: string,
  to?: string,
  field: string = 'createdAt'
): Record<string, any> {
  const hasFrom = typeof from === 'string' && from.trim() !== '';
  const hasTo = typeof to === 'string' && to.trim() !== '';
  if (!hasFrom && !hasTo) return {};

  const range: any = {};
  if (hasFrom) range.$gte = new Date(from as string);
  if (hasTo) {
    const end = new Date(to as string);
    // Inclure toute la journée de fin.
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [field]: range };
}
