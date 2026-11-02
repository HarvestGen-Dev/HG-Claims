import {
  DomainCommandResult,
  executeRpcCommand,
  fetchAuthorizedSnapshot,
} from "@/services/shared/http";

export const NOTIFICATION_ACTIONS = ["read_notifications"] as const;

export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

export function isNotificationAction(
  action: string
): action is NotificationAction {
  return (NOTIFICATION_ACTIONS as readonly string[]).includes(action);
}

export class NotificationAuditService {
  async getDomainState(): Promise<DomainCommandResult> {
    const snapshot = await fetchAuthorizedSnapshot("notifications");
    if (snapshot.error || !snapshot.data) return snapshot;
    return {
      status: 200,
      data: {
        notifications: snapshot.data.notifications ?? [],
        auditLogs: snapshot.data.auditLogs ?? [],
      },
    };
  }

  async execute(
    action: string,
    payload: Record<string, unknown>
  ): Promise<DomainCommandResult> {
    if (!isNotificationAction(action)) {
      return {
        error: `Unsupported Notification action: ${action}`,
        status: 400,
      };
    }
    return executeRpcCommand(action, payload);
  }
}

export const notificationsService = new NotificationAuditService();
