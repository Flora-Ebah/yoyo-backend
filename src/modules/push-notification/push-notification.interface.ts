/**
 * Interface pour le module PushNotification
 */
export interface IPushNotification {
  _id?: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning' | 'error';
  priority: 'low' | 'normal' | 'high';
  data?: {
    [key: string]: any;
  };
  target?: string;
  status: 'pending' | 'sent' | 'failed';
  error?: string;
  sentAt?: Date;
  read?: boolean;
  readAt?: Date;
  readBy?: any[];
}