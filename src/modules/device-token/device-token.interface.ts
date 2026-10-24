/** Application YoYo qui a enregistré le jeton : une push marchand ne doit partir que vers le Pro. */
export type DeviceApp = 'client' | 'pro';

export type DevicePlatform = 'ios' | 'android';

/**
 * Jeton FCM d'un appareil. Un utilisateur peut en avoir plusieurs (téléphone + tablette, appli
 * Client + appli Pro) ; un jeton n'appartient qu'à un utilisateur à la fois.
 */
export interface IDeviceToken {
  _id?: string;
  user: any;
  token: string;
  app: DeviceApp;
  platform: DevicePlatform;
  /** Dernier enregistrement par l'appli : sert à purger les appareils abandonnés. */
  lastSeenAt?: Date;
}
