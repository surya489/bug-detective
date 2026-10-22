const WINDOW_MS = 15 * 60 * 1000;
const MAX_SCANS_PER_WINDOW = 5;
const requests = new Map<string, number[]>();

export function allowRepositoryScan(key: string, now = Date.now()): boolean {
  const recent = (requests.get(key) ?? []).filter(
    (timestamp) => timestamp > now - WINDOW_MS,
  );
  if (recent.length >= MAX_SCANS_PER_WINDOW) {
    requests.set(key, recent);
    return false;
  }
  recent.push(now);
  requests.set(key, recent);
  if (requests.size > 1_000) {
    for (const [storedKey, timestamps] of requests) {
      if (timestamps.every((timestamp) => timestamp <= now - WINDOW_MS)) {
        requests.delete(storedKey);
      }
      if (requests.size <= 1_000) break;
    }
  }
  return true;
}
