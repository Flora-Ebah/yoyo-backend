/**
 * Amorçage commun aux tests.
 *
 * `src/main.ts` s'auto-instancie au chargement (`export const app = new Main()`), et son
 * constructeur ouvre immédiatement un port. Comme `router.ts` et `push.service.ts` importent
 * `main.ts`, tout import de route ou de service déclenche ce démarrage.
 *
 * Tant que ce point d'entrée n'est pas rendu explicite, on force ici un port éphémère (0) afin
 * que la suite de tests n'entre pas en conflit avec un serveur de développement déjà lancé.
 */
process.env.SERVER_PORT = process.env.TEST_SERVER_PORT ?? '0';
process.env.USE_DB = process.env.TEST_USE_DB ?? 'no';

// Les tests de jetons signent et vérifient localement : une valeur de repli suffit, et évite de
// dépendre du `.env` du poste. `dotenv` ne réécrit pas une variable déjà définie.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_AUTH_SECRET = process.env.JWT_AUTH_SECRET ?? 'test-jwt-auth-secret';
