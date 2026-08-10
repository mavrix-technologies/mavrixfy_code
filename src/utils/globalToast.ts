// Global toast utility — separated here so src/features/* can import it
// without violating the boundary rule against importing from app/_layout.

type GlobalToastListener = (message: string) => void;

const globalToastListeners = new Set<GlobalToastListener>();

export function subscribeGlobalToast(listener: GlobalToastListener): () => void {
  globalToastListeners.add(listener);
  return () => {
    globalToastListeners.delete(listener);
  };
}

export function showGlobalToast(message = "Added to queue") {
  globalToastListeners.forEach((listener) => listener(message));
}
