// Global toast utility — separated here so src/features/* can import it
// without violating the boundary rule against importing from app/_layout.

export type ToastAction = { label: string; url: string };
type GlobalToastListener = (message: string, action?: ToastAction) => void;

const globalToastListeners = new Set<GlobalToastListener>();

export function subscribeGlobalToast(listener: GlobalToastListener): () => void {
  globalToastListeners.add(listener);
  return () => {
    globalToastListeners.delete(listener);
  };
}

export function showGlobalToast(message = "Added to queue", action?: ToastAction) {
  globalToastListeners.forEach((listener) => listener(message, action));
}
