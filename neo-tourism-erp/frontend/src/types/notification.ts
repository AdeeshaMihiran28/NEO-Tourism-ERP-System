export type NotificationType =
  | "GENERAL"
  | "LEAD_ASSIGNED"
  | "LEAD_UPDATED"
  | "SYSTEM"
  | "CALLBACK_DUE"
  | "MISSED_CALLBACK"
  | "ATTENTION_LEAD"
  | "LEAD_REASSIGNED"
  | "NEW_SALE"
  | "SALE_ACCEPTED";

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: NotificationItem[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
