import { useAppStore } from "./store";
import type { ToastInput } from "./store/types";

let notificationPermissionRequested = false;

async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  if (notificationPermissionRequested) return Notification.permission;
  notificationPermissionRequested = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/**
 * Show an in-app toast and - if the user has granted permission - also fire
 * an OS notification. Use this for long-running async results (deploy,
 * publish) where the user has likely tabbed away.
 */
export async function notify(input: ToastInput & { osNotification?: boolean }) {
  const id = useAppStore.getState().pushToast(input);

  if (input.osNotification !== false && typeof document !== "undefined" && document.hidden) {
    const permission = await ensureNotificationPermission();
    if (permission === "granted") {
      try {
        new Notification(input.title, {
          body: input.description,
          tag: id,
        });
      } catch {
        /* notification fired-and-forgot */
      }
    }
  }

  return id;
}

export const toast = {
  info: (input: Omit<ToastInput, "variant">) => useAppStore.getState().pushToast({ ...input, variant: "info" }),
  success: (input: Omit<ToastInput, "variant">) => useAppStore.getState().pushToast({ ...input, variant: "success" }),
  warning: (input: Omit<ToastInput, "variant">) => useAppStore.getState().pushToast({ ...input, variant: "warning" }),
  error: (input: Omit<ToastInput, "variant">) => useAppStore.getState().pushToast({ ...input, variant: "error" }),
  loading: (input: Omit<ToastInput, "variant">) =>
    useAppStore.getState().pushToast({ ...input, variant: "loading", durationMs: 60_000 }),
  dismiss: (id: string) => useAppStore.getState().dismissToast(id),
};
