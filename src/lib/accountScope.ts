let accountId: string | null = null;
let generation = 0;

export function getAccountScope() {
  return { accountId, generation };
}

export function setAccountScope(uid: string | null) {
  if (uid !== accountId) {
    accountId = uid;
    generation += 1;
  }
}

export function accountStorageKey(key: string, uid = accountId): string {
  return `@mavrixfy_account:${encodeURIComponent(uid ?? 'guest')}:${key}`;
}

export function isCurrentAccount(scope: ReturnType<typeof getAccountScope>) {
  return scope.generation === generation && scope.accountId === accountId;
}
