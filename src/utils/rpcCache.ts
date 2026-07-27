interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

export const createRpcCache = <T>(ttlMs: number) => {
  let entry: CacheEntry<T> | null = null;
  let inflight: Promise<T> | null = null;

  return {
    read(): T | null {
      if (!entry) return null;
      if (Date.now() - entry.cachedAt > ttlMs) {
        entry = null;
        return null;
      }
      return entry.value;
    },
    write(value: T) {
      entry = { value, cachedAt: Date.now() };
    },
    clear() {
      entry = null;
      inflight = null;
    },
    async getOrFetch(fetcher: () => Promise<T>, force = false): Promise<T> {
      if (!force) {
        const cached = this.read();
        if (cached !== null) return cached;
      }

      if (inflight) return inflight;

      inflight = fetcher()
        .then((value) => {
          this.write(value);
          inflight = null;
          return value;
        })
        .catch((error) => {
          inflight = null;
          throw error;
        });

      return inflight;
    },
  };
};
