export interface ShareSheetData {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url: string;
  type?: "song" | "playlist" | "artist" | "mix";
}

type ShareSheetListener = (data: ShareSheetData | null) => void;

const listeners = new Set<ShareSheetListener>();

export function subscribeShareSheet(listener: ShareSheetListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openShareSheet(data: ShareSheetData): void {
  listeners.forEach((listener) => listener(data));
}

export function closeShareSheet(): void {
  listeners.forEach((listener) => listener(null));
}
