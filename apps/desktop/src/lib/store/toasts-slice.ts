import type { SetState, ToastsSlice, Toast, ToastInput } from "./types";

export function createToastsSlice(set: SetState): ToastsSlice {
  let counter = 0;
  const nextId = () => `${Date.now()}-${++counter}`;

  return {
    toasts: [],

    pushToast: (input: ToastInput) => {
      const id = input.id ?? nextId();
      const toast: Toast = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
        durationMs: input.durationMs ?? (input.variant === "error" ? 8000 : 4000),
        action: input.action,
        createdAt: Date.now(),
      };
      set((state) => ({
        toasts: [...state.toasts.filter((t) => t.id !== id), toast],
      }));
      return id;
    },

    dismissToast: (id) => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    },

    clearToasts: () => set({ toasts: [] }),
  };
}
