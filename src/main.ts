import coddyger, { env, getDatabaseAccess } from "coddyger";
import Router from "./router";
import { MainHelper, SocketIOHelper } from "./helpers";
import { startCleanupCron } from './cron/cleanup-clients.cron';
import { startSubscriptionRenewalCron } from './cron/subscription-renewal.cron';
import { initNotificationServices } from './services/notification';
import { assertSecureConfiguration } from './config/security-check';

// Instance Socket.IO globale
let socketInstance: SocketIOHelper | undefined;

// Fonction pour obtenir l'instance Socket.IO
export function getSocketIO(): SocketIOHelper | undefined {
  return socketInstance;
}

export class Main {
  public server: any;

  constructor() {
    // [SÉCURITÉ B-05] Avant toute chose : un déploiement configuré avec les secrets publiés dans
    // le dépôt ne doit pas s'ouvrir au réseau.
    assertSecureConfiguration()

    this.server = new Router().router
    this.run()
  }

  private run() {
    // Render (et la plupart des PaaS) injectent le port via PORT : on le privilégie,
    // sinon SERVER_PORT (dev/VPS), sinon 3014 par défaut.
    let port = Number(process.env.PORT || process.env.SERVER_PORT || 3014)
    
    this.server.listen({ port, host: '0.0.0.0' }, async (err:any, address) => {
      if (err) {
        if(err.code === 'EADDRINUSE') {
          coddyger.konsole(`Le port ${port} est déjà utilisé`, 1);
          process.exit(1);
        } else {
          console.error(err);
        }
      }
      coddyger.konsole(`Server connecté :: ${address}`)
      await this.initPayloads() 
    })
  }

  private async db() {
    if (env.database.useDatabase === 'yes') {
      const databaseAccess = getDatabaseAccess();
      await databaseAccess.connect(); 
    }
  }

  private async initPayloads() {
    this.db()
    
    // Créer l'instance Socket.IO après le démarrage du serveur
    socketInstance = new SocketIOHelper(this.server.server);

    // Initialiser les services de notification
    try {
      const notificationManager = initNotificationServices();
      await notificationManager.init();
    } catch (error) {
      console.error('Erreur lors de l\'initialisation des services de notification:', error);
    }

    MainHelper.setDefaultProfile()
    
    // Start cleanup cron job
    startCleanupCron();
    
    // Start subscription renewal cron job
    startSubscriptionRenewalCron();
  }
}

export const app = new Main()
