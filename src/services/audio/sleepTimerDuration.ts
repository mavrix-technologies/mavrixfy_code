export const MAX_SLEEP_TIMER_MINUTES = 23 * 60 + 59;

export function isValidSleepTimerDuration(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes > 0 && minutes <= MAX_SLEEP_TIMER_MINUTES;
}

export function formatSleepTimerDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
