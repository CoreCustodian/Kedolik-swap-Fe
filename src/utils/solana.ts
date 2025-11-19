import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// RPC endpoint - use VITE_RPC_ENDPOINT from .env or fallback to PublicNode (free, reliable)
// PublicNode: https://solana-rpc.publicnode.com (free, no API key required)
// For production with high traffic, consider: Helius, Quicknode, or Alchemy
const RPC_ENDPOINT = import.meta.env.VITE_RPC_ENDPOINT || import.meta.env.VITE_RPC_URL || 'https://solana-rpc.publicnode.com';

export const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// Get all token accounts for a wallet
export const getTokenAccounts = async (walletAddress: PublicKey) => {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletAddress,
      { programId: TOKEN_PROGRAM_ID }
    );

    return tokenAccounts.value.map((account) => {
      const info = account.account.data.parsed.info;
      return {
        mint: info.mint,
        balance: info.tokenAmount.uiAmount,
        decimals: info.tokenAmount.decimals,
      };
    });
  } catch (error) {
    console.error('Error fetching token accounts:', error);
    return [];
  }
};

// Get SOL balance
export const getSolBalance = async (walletAddress: PublicKey) => {
  try {
    const balance = await connection.getBalance(walletAddress);
    return balance / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    return 0;
  }
};

// Get transaction signatures for a wallet
export const getTransactionHistory = async (
  walletAddress: PublicKey,
  limit: number = 50
) => {
  try {
    const signatures = await connection.getSignaturesForAddress(walletAddress, {
      limit,
    });

    return signatures;
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return [];
  }
};

// Get detailed transaction info
export const getTransactionDetails = async (signature: string) => {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    return tx;
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    return null;
  }
};

// Parse swap transaction to extract token info
export const parseSwapTransaction = (tx: ParsedTransactionWithMeta | null) => {
  if (!tx || !tx.meta) return null;

  try {
    // Extract pre and post token balances
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];

    // Find token changes
    const changes = postBalances.map((post) => {
      const pre = preBalances.find((p) => p.accountIndex === post.accountIndex);
      if (!pre) return null;

      const preAmount = Number(pre.uiTokenAmount.uiAmount || 0);
      const postAmount = Number(post.uiTokenAmount.uiAmount || 0);
      const change = postAmount - preAmount;

      return {
        mint: post.mint,
        change,
        decimals: post.uiTokenAmount.decimals,
      };
    }).filter(Boolean);

    return changes;
  } catch (error) {
    console.error('Error parsing swap transaction:', error);
    return null;
  }
};

