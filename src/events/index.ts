import { AppEvents, eventBus } from './event-bus';
import { handlePaymentInitiated } from './handlers/payment-initiated.handler';

export { eventBus, AppEvents, InMemoryEventQueue } from './event-bus';
export type { IEventQueue, EventHandler } from './event-bus';
export type { IPaymentInitiatedPayload } from './handlers/payment-initiated.handler';

/**
 * Branche les consommateurs sur la file d'événements.
 *
 * À appeler depuis `main.ts:initPayloads()` APRÈS `initNotificationServices()` : les handlers
 * publient via le `NotificationManager`, qui doit être initialisé.
 */
export const initEventBus = (): void => {
  eventBus.subscribe(AppEvents.PAYMENT_INITIATED, handlePaymentInitiated);
  console.log('[EVENTS] File d’événements démarrée (1 consommateur enregistré)');
};
