import { Connection } from '@solana/web3.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const verifySuccessfulTransaction = async (signature: string): Promise<boolean> => {
  const rpcUrl =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.VITE_RPC_ENDPOINT?.trim() ||
    'https://api.mainnet-beta.solana.com';

  const connection = new Connection(rpcUrl, 'confirmed');

  // Tx may not be visible immediately after Jupiter lands it — retry briefly.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = value[0];

    if (status?.err) {
      return false;
    }

    if (status) {
      const confirmed =
        status.confirmationStatus === 'confirmed' ||
        status.confirmationStatus === 'finalized' ||
        status.confirmations === null;
      if (confirmed) {
        return true;
      }
    }

    if (attempt < 4) {
      await sleep(1500);
    }
  }

  return false;
};
