import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { TokenInfo } from '../config/tokens';
import { primeMintDecimals } from './amm';
import { batchGetBalances } from './balanceCache';

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
}

/**
 * Fetch all token balances for a wallet including native SOL
 * @param connection - Solana connection
 * @param walletAddress - Wallet public key
 * @param tokenList - List of tokens to fetch balances for (from remote config)
 */
export const fetchAllBalances = async (
  connection: Connection,
  walletAddress: PublicKey,
  tokenList: TokenInfo[] = []
): Promise<TokenBalance[]> => {
  const balances: TokenBalance[] = [];

  try {
    const solBalance = await connection.getBalance(walletAddress);
    balances.push({
      mint: 'native',
      symbol: 'SOL',
      name: 'Solana (Native)',
      balance: solBalance / LAMPORTS_PER_SOL,
      decimals: 9,
    });
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    balances.push({
      mint: 'native',
      symbol: 'SOL',
      name: 'Solana (Native)',
      balance: 0,
      decimals: 9,
    });
  }

  if (tokenList.length === 0) {
    return balances;
  }

  // Decimals come from the token list, so no per-mint lookups are needed.
  tokenList.forEach((token) => primeMintDecimals(token.mint.toString(), token.decimals));

  // One batched read for every token instead of a getTokenAccountBalance per token.
  const batched = await batchGetBalances(
    connection,
    tokenList.map((token) => ({ mint: token.mint, wallet: walletAddress })),
  ).catch(() => new Map<string, number>());

  const walletKey = walletAddress.toString();

  tokenList.forEach((token) => {
    balances.push({
      mint: token.mint.toString(),
      symbol: token.symbol,
      name: token.name,
      balance: batched.get(`${token.mint.toString()}-${walletKey}`) ?? 0,
      decimals: token.decimals,
    });
  });

  return balances;
};

/**
 * Fetch a single token balance
 */
export const fetchTokenBalance = async (
  connection: Connection,
  walletAddress: PublicKey,
  tokenMint: PublicKey
): Promise<number> => {
  try {
    const tokenAccount = await getAssociatedTokenAddress(tokenMint, walletAddress);
    const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
    return parseFloat(accountInfo.value.uiAmount?.toString() || '0');
  } catch (error) {
    return 0;
  }
};

