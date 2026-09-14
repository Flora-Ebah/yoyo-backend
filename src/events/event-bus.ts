import { LoggerService, LogLevel } from 'coddyger';

/** Un consommateur d'événement. Doit lever en cas d'échec pour déclencher un réessai. */
export type EventHandler = (payload: any) => Promise<void>;

/**
 * Contrat de la file d'événements. Volontairement minimal : `publish` côté producteur (dans le
 * chemin critique d'une requête HTTP) et `subscribe` côté consommateur. Une implémentation
 * BullMQ/Redis pourra s'y substituer sans toucher aux appelants — `ioredis` est déjà une
 * dépendance directe et `docker-compose.yaml` provisionne déjà un Redis.
 */
export interface IEventQueue {
  publish(name: string, payload: any): Promise<void>;
  subscribe(name: string, handler: EventHandler): void;
}

interface IJob {
  name: string;
  payload: any;
  attempt: number;
}

const MAX_ATTEMPTS = 3;
const CONCURRENCY = 5;
/** Délais de réessai : 1 s, puis 4 s, puis 16 s. */
const RETRY_DELAYS_MS = [1000, 4000, 16000];

/**
 * File d'événements en mémoire, à concurrence bornée.
 *
 * Raison d'être : sortir du chemin critique d'un scan tout ce dont le client n'a pas besoin pour
 * être servi (notification au partenaire, diffusion socket). Le client reçoit sa réponse dès que
 * la demande de réduction est écrite ; le reste se fait derrière.
 *
 * Limite assumée — voir `README.md` de ce dossier : la file vit dans le processus. Un redémarrage
 * perd les jobs en attente. C'est acceptable ici parce que la demande de réduction, elle, est
 * persistée : une notification perdue signifie seulement que le partenaire ne reçoit pas l'alerte
 * temps réel, et son app dispose déjà de `GET /payments/last-pending/:partnerId` pour se rattraper.
 * Cette implémentation suppose `instances: 1` (cf. `ecosystem.config.js`) : en cluster, chaque
 * processus aurait sa propre file.
 */
export class InMemoryEventQueue implements IEventQueue {
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly queue: IJob[] = [];
  private running = 0;
  private readonly serviceLabel = 'InMemoryEventQueue';

  subscribe(name: string, handler: EventHandler): void {
    const existing = this.handlers.get(name) ?? [];
    existing.push(handler);
    this.handlers.set(name, existing);
  }

  /**
   * Dépose un événement et rend la main immédiatement.
   *
   * Ne lève JAMAIS : le producteur est dans le chemin critique d'une requête HTTP et une panne de
   * la file ne doit pas faire échouer une demande de réduction déjà écrite en base.
   */
  async publish(name: string, payload: any): Promise<void> {
    try {
      if (!this.handlers.has(name)) {
        LoggerService.log({
          type: LogLevel.Warn,
          content: `Aucun consommateur pour l'événement « ${name} » : il est ignoré`,
          location: this.serviceLabel,
          method: 'publish'
        });
        return;
      }

      this.queue.push({ name, payload, attempt: 0 });
      this.drain();
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'publish'
      });
    }
  }

  /** Nombre de jobs en attente. Utile aux tests et à une future sonde de supervision. */
  get pending(): number {
    return this.queue.length + this.running;
  }

  /** Lance autant de jobs que la concurrence le permet. */
  private drain(): void {
    while (this.running < CONCURRENCY && this.queue.length > 0) {
      const job = this.queue.shift() as IJob;
      this.running += 1;
      // Pas de `await` : `drain` ne doit pas bloquer son appelant.
      void this.run(job).finally(() => {
        this.running -= 1;
        this.drain();
      });
    }
  }

  private async run(job: IJob): Promise<void> {
    const handlers = this.handlers.get(job.name) ?? [];

    for (const handler of handlers) {
      try {
        await handler(job.payload);
      } catch (error) {
        this.scheduleRetry(job, error);
      }
    }
  }

  private scheduleRetry(job: IJob, error: unknown): void {
    const nextAttempt = job.attempt + 1;

    if (nextAttempt >= MAX_ATTEMPTS) {
      LoggerService.log({
        type: LogLevel.Error,
        content: `Événement « ${job.name} » abandonné après ${MAX_ATTEMPTS} tentatives : ${
          (error as Error)?.message ?? error
        }`,
        location: this.serviceLabel,
        method: 'scheduleRetry'
      });
      return;
    }

    const delay = RETRY_DELAYS_MS[job.attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

    LoggerService.log({
      type: LogLevel.Warn,
      content: `Événement « ${job.name} » en échec (tentative ${nextAttempt}/${MAX_ATTEMPTS}), nouvel essai dans ${delay} ms`,
      location: this.serviceLabel,
      method: 'scheduleRetry'
    });

    // `unref` : un réessai en attente ne doit pas empêcher le processus de s'arrêter.
    const timer = setTimeout(() => {
      this.queue.push({ ...job, attempt: nextAttempt });
      this.drain();
    }, delay);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }
}

/** Singleton applicatif. */
export const eventBus: IEventQueue & { pending?: number } = new InMemoryEventQueue();

/** Noms d'événements. Centralisés pour éviter les chaînes en dur des deux côtés de la file. */
export const AppEvents = {
  PAYMENT_INITIATED: 'payment.initiated'
} as const;
