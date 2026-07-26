import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { TokenInfo } from '../config/tokens';

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export const isValidMintAddress = (value: string): boolean => {
  try {
    new PublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
};

const readMetaplexMetadata = async (
  connection: Connection,
  mint: PublicKey
): Promise<{ symbol: string; name: string } | null> => {
  try {
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      METADATA_PROGRAM_ID
    );

    const account = await connection.getAccountInfo(metadataPda);
    if (!account?.data?.length) return null;

    const data = Buffer.from(account.data);
    if (data[0] !== 4) return null;

    let offset = 1 + 32 + 32;
    let name = '';
    let symbol = '';

    if (offset + 4 <= data.length) {
      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      if (nameLen > 0 && nameLen < 1000 && offset + nameLen <= data.length) {
        name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '').trim();
        offset += nameLen;
      }
    }

    if (offset + 4 <= data.length) {
      const symbolLen = data.readUInt32LE(offset);
      offset += 4;
      if (symbolLen > 0 && symbolLen < 100 && offset + symbolLen <= data.length) {
        symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '').trim();
      }
    }

    return symbol && name ? { symbol, name } : null;
  } catch {
    return null;
  }
};

const readSplTokenMetadataExtension = async (
  connection: Connection,
  mint: PublicKey
): Promise<{ symbol: string; name: string } | null> => {
  try {
    const mintAccount = await connection.getParsedAccountInfo(mint);
    const parsed = mintAccount.value?.data;
    if (!parsed || !('parsed' in parsed)) return null;

    const extensions = parsed.parsed.info.extensions;
    if (!Array.isArray(extensions)) return null;

    for (const ext of extensions) {
      if (ext.extension === 'tokenMetadata' && ext.state) {
        const name = ext.state.name as string | undefined;
        const symbol = ext.state.symbol as string | undefined;
        if (name && symbol) return { symbol, name };
      }
    }
    return null;
  } catch {
    return null;
  }
};

/** Resolve any SPL mint on-chain (works for pump.fun and other long-tail tokens). */
export const resolveTokenFromMint = async (
  connection: Connection,
  mintAddress: string
): Promise<TokenInfo | null> => {
  const trimmed = mintAddress.trim();
  if (!isValidMintAddress(trimmed)) return null;

  try {
    const mint = new PublicKey(trimmed);
    const mintInfo = await getMint(connection, mint);
    const metaplex = await readMetaplexMetadata(connection, mint);
    const splMeta = metaplex ? null : await readSplTokenMetadataExtension(connection, mint);
    const meta = metaplex ?? splMeta;

    const short = `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
    return {
      mint,
      symbol: meta?.symbol || short.toUpperCase(),
      name: meta?.name || `Token ${short}`,
      decimals: mintInfo.decimals,
    };
  } catch (error) {
    console.error('resolveTokenFromMint failed:', error);
    return null;
  }
};

export const createMintPlaceholder = (mintAddress: string): TokenInfo | null => {
  if (!isValidMintAddress(mintAddress)) return null;
  const mint = new PublicKey(mintAddress.trim());
  const short = `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
  return {
    mint,
    symbol: short.toUpperCase(),
    name: 'Loading token...',
    decimals: 9,
  };
};
