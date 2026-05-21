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

export function forEachFiltered<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => boolean,
  visitor: (item: T, index: number) => void
): void {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (predicate(item, index)) {
      visitor(item, index);
    }
  }
}

export function flatMapMap<T, U, V>(
  items: readonly T[],
  flatMapper: (item: T, index: number) => readonly U[],
  mapper: (item: U, index: number) => V
): V[] {
  const results: V[] = [];
  let mappedIndex = 0;
  for (let index = 0; index < items.length; index += 1) {
    const innerItems = flatMapper(items[index], index);
    for (const innerItem of innerItems) {
      results.push(mapper(innerItem, mappedIndex));
      mappedIndex += 1;
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
