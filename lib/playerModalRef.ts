export const globalPlayerDetailsVisibleRef = {
  current: false,
  listeners: new Set<(visible: boolean) => void>(),
  setVisible(visible: boolean) {
    if (this.current === visible) return;
    this.current = visible;
    this.listeners.forEach((l) => l(visible));
  },
  subscribe(listener: (visible: boolean) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
};
