import { CancelledError } from "./userError.js";

// Runs fn over items with at most `limit` running at once and keeps the order.
// If one item fails, no new items are started.
export async function mapLimit(items, limit, fn, signal) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed) {
      if (signal?.aborted) throw new CancelledError();
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  });
  await Promise.all(workers);
  return results;
}
