import type { AuditLog, Notification } from "@/lib/types/database";
import { workspaceStore } from "./store";

const NOTIFICATIONS_ENDPOINT = "/api/v1/notifications";

export class NotificationClient {
  getAuditLogs(): AuditLog[] {
    return workspaceStore.getState().auditLogs || [];
  }

  getNotifications(userId: string): Notification[] {
    return (workspaceStore.getState().notifications || []).filter(
      item => item.user_id === userId
    );
  }

  async markNotificationAsRead(id: string) {
    const previous = workspaceStore.getState().notifications;
    workspaceStore.patchState({
      notifications: previous.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      ),
    });
    try {
      return await workspaceStore.dispatchDomainCommand(
        NOTIFICATIONS_ENDPOINT,
        "read_notifications",
        { id }
      );
    } catch (error) {
      workspaceStore.patchState({ notifications: previous });
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: string) {
    const previous = workspaceStore.getState().notifications;
    workspaceStore.patchState({
      notifications: previous.map(n =>
        !userId || n.user_id === userId ? { ...n, is_read: true } : n
      ),
    });
    try {
      return await workspaceStore.dispatchDomainCommand(
        NOTIFICATIONS_ENDPOINT,
        "read_notifications",
        {}
      );
    } catch (error) {
      workspaceStore.patchState({ notifications: previous });
      throw error;
    }
  }
}

export const notificationClient = new NotificationClient();
