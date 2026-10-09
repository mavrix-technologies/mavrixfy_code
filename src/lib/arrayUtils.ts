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
  // Fisher–Yates: each remaining item is selected once, in linear time.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Builds one playback order while leaving the caller's canonical queue intact. */
export function shufflePlaybackQueue<T extends { id: string }>(
  source: readonly T[],
  anchorIndex = -1,
): { queue: T[]; index: number } | null {
  if (!Array.isArray(source) || source.length === 0) return null;

  const items = [...source];
  const hasAnchor = Number.isInteger(anchorIndex) && anchorIndex >= 0 && anchorIndex < items.length;
  const anchor = hasAnchor ? items.splice(anchorIndex, 1)[0] : undefined;
  const queue = shuffleArray(items);
  if (anchor) queue.unshift(anchor);

  return { queue, index: 0 };
}
