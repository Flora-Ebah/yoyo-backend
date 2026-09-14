import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env, LoggerService, LogLevel } from 'coddyger';

const helperLabel = 'SocketIOHelper';

export class SocketIOHelper {
	private io: SocketIOServer;

	constructor(server) {
		this.io = new SocketIOServer(server, {
      cors: {
        origin: '*', // Permettre les requêtes depuis n'importe quelle origine
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket: Socket) => {
      // Chaque socket authentifié rejoint une room à son identifiant d'utilisateur. C'est ce qui
      // permet d'adresser une notification à UN destinataire au lieu de la diffuser à tous les
      // téléphones connectés : avec un millier de connectés, cent scans simultanés passaient de
      // ~100 000 messages sérialisés dans la boucle d'événements à ~100.
      const userId = SocketIOHelper.identify(socket);

      if (userId) {
        socket.join(userId);
      } else {
        // Connexion sans jeton exploitable : tolérée, et c'est délibéré. Les applications mobiles
        // construisent leur socket au démarrage, donc AVANT la connexion de l'utilisateur : refuser
        // provoquerait une boucle d'erreurs de connexion sur l'écran de login. La reconnexion
        // réévalue `auth` et fera rejoindre la room dès que le jeton existera.
        //
        // Refuser n'apporterait d'ailleurs rien : un socket sans room ne reçoit aucune
        // notification nominative — c'est la propriété de sécurité qui compte ici.
        LoggerService.log({
          type: LogLevel.Info,
          content: 'Connexion WebSocket sans jeton : aucune room rejointe (socket d’avant-connexion)',
          location: helperLabel,
          method: 'connection'
        });
      }

      // Ré-identification EN COURS DE SESSION — indispensable, et pas un simple confort.
      //
      // Les applications mobiles construisent leur socket au démarrage, donc avant la connexion de
      // l'utilisateur. `auth` sous forme de fonction n'est réévalué qu'à une *reconnexion* : un
      // socket ouvert sans jeton et qui se porte bien n'a aucune raison de se reconnecter, et
      // restait donc **anonyme pour toute la session** une fois l'utilisateur connecté. Aucune
      // notification nominative ne lui parvenait : ni bandeau, ni rafraîchissement d'écran.
      //
      // Le jeton est vérifié ICI, côté serveur, exactement comme au handshake. L'identifiant de
      // room est déduit du jeton, jamais fourni par le client : sans quoi n'importe quel socket
      // pourrait rejoindre la room d'autrui et lire ses notifications.
      socket.on('identify', (payload: any, ack?: (result: any) => void) => {
        const raw: string =
          (typeof payload === 'string' ? payload : payload?.token) ?? '';
        const id: string | null = raw ? SocketIOHelper.resolveUserId(String(raw)) : null;

        // Quitter l'identité précédente avant d'en prendre une nouvelle. Sur un appareil partagé
        // (le téléphone du comptoir), un commerçant qui se déconnecte et laisse la place à un
        // autre continuerait sinon de recevoir les demandes du premier.
        SocketIOHelper.leaveIdentityRooms(socket);

        if (id) {
          socket.join(id);
        }

        const result = { ok: Boolean(id) };
        socket.emit('identified', result);
        if (typeof ack === 'function') {
          ack(result);
        }
      });

      // L'ancien `this.io.emit('message', …)` diffusait à TOUS les connectés à chaque nouvelle
      // connexion, soit un coût quadratique lors d'une reconnexion de masse (retour du Wi-Fi dans
      // une boutique). Aucun client n'exploitait cet événement.
    });
  }

  /**
   * Fait quitter au socket toutes ses rooms d'identité.
   *
   * Socket.IO place d'office chaque socket dans une room à son propre identifiant : celle-ci est
   * conservée, seules les rooms d'utilisateur sont quittées.
   */
  private static leaveIdentityRooms(socket: Socket): void {
    for (const room of Array.from(socket.rooms)) {
      if (room !== socket.id) {
        socket.leave(room);
      }
    }
  }

  /**
   * Extrait l'identifiant de l'utilisateur du handshake.
   *
   * Le jeton est lu dans `handshake.auth.token` (forme recommandée par socket.io) et, à défaut,
   * dans l'en-tête `Authorization` ou la query `token` pour rester compatible avec les clients
   * existants. Même secret et même exigence de jeton nominatif que `TokenMiddleware.verify`
   * (cf. [SÉCURITÉ C-01]).
   *
   * @returns l'identifiant de l'utilisateur, ou `null` si le handshake n'est pas authentifiable
   */
  private static identify(socket: Socket): string | null {
    try {
      const handshake: any = socket.handshake ?? {};
      const raw: string =
        handshake.auth?.token ?? handshake.headers?.authorization ?? handshake.query?.token ?? '';

      if (!raw) {
        return null;
      }

      return SocketIOHelper.resolveUserId(String(raw));
    } catch (error) {
      // Jeton expiré ou invalide : on ne rejoint pas de room, sans casser la connexion.
      return null;
    }
  }

  /**
   * Vérifie un jeton brut et en extrait l'identifiant de l'utilisateur.
   *
   * Partagé entre le handshake et la ré-identification en cours de session, pour que les deux
   * chemins appliquent exactement le même contrôle.
   *
   * @param raw jeton, accepté sous la forme « Bearer <jeton> » comme « <jeton> »
   */
  private static resolveUserId(raw: string): string | null {
    try {
      const token = raw.startsWith('Bearer ') ? raw.split(' ')[1] : raw;

      // Deux secrets coexistent dans le projet : `jwt.secret` signe les jetons d'accès des
      // applications mobiles (`TokenMiddleware.verify`) et `jwt.secretAuth` ceux des comptes
      // d'administration (`verifyAdmin`). Les deux doivent pouvoir rejoindre leur room, sans quoi
      // l'espace d'administration ne recevrait aucune notification ciblée.
      const payload: any = SocketIOHelper.verifyWithEitherSecret(token);
      const id = payload?._id;

      return typeof id === 'string' && id.trim().length > 0 ? id : null;
    } catch (error) {
      return null;
    }
  }

  /** Vérifie un jeton contre le secret utilisateur puis, à défaut, le secret administrateur. */
  private static verifyWithEitherSecret(token: string): any | null {
    for (const secret of [env.jwt.secret, env.jwt.secretAuth]) {
      if (!secret) {
        continue;
      }

      try {
        return jwt.verify(token, secret);
      } catch (error) {
        // Secret suivant.
      }
    }

    return null;
  }

  /**
   * Indique si au moins un socket est présent dans la room visée, c'est-à-dire si le destinataire
   * est actuellement connecté.
   *
   * Sert au diagnostic (`PushService.send`) : une notification émise vers une room vide ne touche
   * personne, et sans cette distinction un commerçant qui n'a rien reçu est indiscernable d'une
   * notification jamais émise.
   */
  public hasRoom(room: string): boolean {
    const sockets = this.io?.sockets?.adapter?.rooms?.get(room);
    return Boolean(sockets && sockets.size > 0);
  }

  public getIo(): SocketIOServer {
    if (!this.io) {
      throw new Error('Socket.IO non initialisé. Veuillez appeler le constructeur avec un serveur avant de l\'utiliser.');
    }
    return this.io;
  }
}
