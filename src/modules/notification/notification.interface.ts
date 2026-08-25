/**
 * Interface pour le module Notification
 */
import { NotificationType, NotificationCategory } from '../../services/notification/notification.interface';

export interface INotification {
  _id?: string;
  type: NotificationType;
  category: NotificationCategory;
  to: string | string[];
  data: {
    title?: string;
    message: string;
    url?: string;
    imageUrl?: string;
    data?: any;
  };
  template?: string;
  templateData?: any;
  attachments?: Array<{
    filename: string;
    path: string;
    contentType?: string;
  }>;
  status: 'active' | 'inactive' | 'suspended' | 'removed' | 'sent' | 'failed';
  error?: string;
  sentAt?: Date;
}