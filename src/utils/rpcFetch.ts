/** Bound HTTP RPC reads, including those made while preparing a swap. */
export const createRpcFetch = (timeoutMs = 15000, fetchImpl: typeof fetch = globalThis.fetch): typeof fetch =>
  async (input, init) => {
    // Aborting a submission after sending its bytes cannot establish failure.
    // Leave submission lifecycle management to the wallet; apply this deadline to reads.
    if (typeof init?.body === 'string') {
      try {
        const payload = JSON.parse(init.body) as { method?: string };
        if (payload.method === 'sendTransaction') return fetchImpl(input, init);
      } catch { /* Non-JSON requests still get the read deadline. */ }
    }
    const controller = new AbortController();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new Error('RPC request timed out. Please check your connection.')), timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
