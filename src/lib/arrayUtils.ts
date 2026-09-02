export function compactMap<T, U>(
  items: readonly T[],
  mapper: (item: T, index: number) => U | null | undefined | false
): NonNullable<U>[] {
  const results: NonNullable<U>[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const mapped = mapper(items[index], index);
    if (mapped) {
      results.push(mapped as NonNullable<U>);
    }
  }
  return results;
}

export function mapFilter<T, U>(
  items: readonly T[],
  mapper: (item: T, index: number) => U,
  predicate: (item: U, index: number) => unknown
): NonNullable<U>[] {
  const results: NonNullable<U>[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const mapped = mapper(items[index], index);
    if (predicate(mapped, index)) {
      results.push(mapped as NonNullable<U>);
    }
  }
  return results;
}

export function filterMap<T, U>(
  items: readonly T[],
  predicate: (item: T, index: number) => unknown,
  mapper: (item: T, index: number) => U
): U[] {
  const results: U[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (predicate(item, index)) {
      results.push(mapper(item, index));
    }
  }
  return results;
}

export function sortedCopy<T>(
  items: readonly T[],
  compareFn?: (left: T, right: T) => number
): T[] {
  const sorted = Array.from(items);
  sorted.sort(compareFn);
  return sorted;
}

export function shuffleArray<T>(items: readonly T[]): T[] {
  if (!items || items.length <= 1) return items ? [...items] : [];
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createShuffledPlaybackQueue<T extends { id: string }>(
  items: readonly T[],
  startItem?: T | null
): { shuffledQueue: T[]; targetSong: T; targetIndex: number } | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const source = items.filter((s) => Boolean(s?.id));
  if (source.length === 0) return null;

  const target = startItem || source[Math.floor(Math.random() * source.length)] || source[0];
  const others = source.filter((s) => s.id !== target.id);
  const shuffledOthers = shuffleArray(others);

  return {
    shuffledQueue: [target, ...shuffledOthers],
    targetSong: target,
    targetIndex: 0,
  };
}

export function toggleQueueShuffleState<T extends { id: string }>(params: {
  isShuffled: boolean;
  currentSong: T | null;
  activeQueue: readonly T[];
  originalQueue: readonly T[];
}): {
  nextIsShuffled: boolean;
  nextQueue: T[];
  nextIndex: number;
} {
  const nextIsShuffled = !params.isShuffled;
  const current = params.currentSong;
  const canonicalSource =
    params.originalQueue.length > 0 ? params.originalQueue : params.activeQueue;

  if (nextIsShuffled) {
    if (!current) {
      return { nextIsShuffled: true, nextQueue: shuffleArray(canonicalSource), nextIndex: 0 };
    }
    const others = canonicalSource.filter((s) => s.id !== current.id);
    return {
      nextIsShuffled: true,
      nextQueue: [current, ...shuffleArray(others)],
      nextIndex: 0,
    };
  }
  const nextQueue = [...canonicalSource];
  const nextIndex = current
    ? Math.max(0, nextQueue.findIndex((s) => s.id === current.id))
    : 0;
  return { nextIsShuffled: false, nextQueue, nextIndex };
}
