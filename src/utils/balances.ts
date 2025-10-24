import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { getTokenList } from '../config/tokens';

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
}

/**
 * Fetch all token balances for a wallet including native SOL
 */
export const fetchAllBalances = async (
  connection: Connection,
  walletAddress: PublicKey
): Promise<TokenBalance[]> => {
  const balances: TokenBalance[] = [];
  const tokenList = getTokenList();
  
  try {
    // Fetch native SOL balance
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
  
  // Fetch SPL token balances
  for (const token of tokenList) {
    try {
      const tokenAccount = await getAssociatedTokenAddress(
        token.mint,
        walletAddress
      );
      const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
      const balance = parseFloat(accountInfo.value.uiAmount?.toString() || '0');
      
      balances.push({
        mint: token.mint.toString(),
        symbol: token.symbol,
        name: token.name,
        balance: balance,
        decimals: token.decimals,
      });
    } catch (error) {
      // Token account doesn't exist, set balance to 0
      balances.push({
        mint: token.mint.toString(),
        symbol: token.symbol,
        name: token.name,
        balance: 0,
        decimals: token.decimals,
      });
    }
  }
  
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

