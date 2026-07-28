import { get, put } from '@vercel/blob';

const blobToken = (): string | undefined => process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;

const blobStoreId = (): string | undefined => process.env.BLOB_STORE_ID?.trim() || undefined;

const blobOptions = () => {
  const token = blobToken();
  const storeId = blobStoreId();
  return {
    access: 'private' as const,
    ...(token ? { token } : {}),
    ...(storeId ? { storeId } : {}),
  };
};

export const isBlobConfigured = (): boolean => Boolean(blobToken());

export const readJsonBlob = async <T>(pathname: string): Promise<T | null> => {
  if (!isBlobConfigured()) return null;

  try {
    const result = await get(pathname, { ...blobOptions(), useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }

    const text = await new Response(result.stream).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

export const writeJsonBlob = async <T>(pathname: string, value: T): Promise<void> => {
  if (!isBlobConfigured()) return;

  await put(pathname, JSON.stringify(value), {
    ...blobOptions(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
};
