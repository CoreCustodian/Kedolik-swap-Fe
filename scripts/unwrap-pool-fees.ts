import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { getAccount, closeAccount, NATIVE_MINT } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ⚠️ OBSOLETE SCRIPT - NO LONGER NEEDED ⚠️
 * 
 * This script was used to unwrap WSOL pool creation fees back to regular SOL.
 * 
 * THE CONTRACT HAS BEEN UPGRADED!
 * Pool creation fees now go directly to the wallet as native SOL.
 * No unwrapping is needed anymore.
 * 
 * Keeping this script for historical reference only.
 * 
 * ---
 * 
 * This script will:
 * 1. Check the WSOL balance in the fee receiver account
 * 2. Close the WSOL account (automatically unwraps to SOL)
 * 3. The SOL will appear in the owner's wallet balance
 */

// --- Configuration ---
// Get RPC from environment variable (REQUIRED)
const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT;
if (!RPC_ENDPOINT) {
  console.error('❌ ERROR: VITE_RPC_ENDPOINT is not set in environment!');
  console.error('💡 Please set it in your .env file or export it:');
  console.error('   export VITE_RPC_ENDPOINT=https://your-quicknode-endpoint.solana-mainnet.quiknode.pro/your-key/');
  process.exit(1);
}
const FEE_RECEIVER_WALLET = new PublicKey('67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa');
const FEE_RECEIVER_WSOL_ACCOUNT = new PublicKey('FRX2thfNDB3MhHYHhcGZFiVK7NbuY2HzGn9WQDtAGBvX');

// Path to the keypair for the fee receiver wallet
// Adjust this path to where your keypair JSON file is located
const KEYPAIR_PATH = process.env.FEE_RECEIVER_KEYPAIR || 
  path.resolve(process.env.HOME || __dirname, '.config/solana/id.json');

async function main() {
  console.log('⚠️  OBSOLETE SCRIPT - NO LONGER NEEDED ⚠️');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('🎉 Good news! The contract has been upgraded!');
  console.log('');
  console.log('Pool creation fees now go DIRECTLY to your wallet as native SOL.');
  console.log('You no longer need to unwrap WSOL.');
  console.log('');
  console.log('To check your fees, simply run:');
  console.log('  solana balance 67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa --url devnet');
  console.log('');
  console.log('See HOW_TO_COLLECT_POOL_FEES.md for details.');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('This script will still work if you have old WSOL to unwrap...');
  console.log('');
  console.log('💰 Checking for legacy WSOL fees...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  
  // Load the fee receiver keypair
  console.log('🔑 Loading fee receiver keypair...');
  let feeReceiverKeypair: Keypair;
  
  try {
    const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    feeReceiverKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    console.log('✅ Keypair loaded:', feeReceiverKeypair.publicKey.toString());
    
    if (!feeReceiverKeypair.publicKey.equals(FEE_RECEIVER_WALLET)) {
      console.error('❌ ERROR: Keypair does not match fee receiver wallet!');
      console.error('   Expected:', FEE_RECEIVER_WALLET.toString());
      console.error('   Got:', feeReceiverKeypair.publicKey.toString());
      console.error('');
      console.error('💡 Set the correct keypair path:');
      console.error('   export FEE_RECEIVER_KEYPAIR=/path/to/your/keypair.json');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error loading keypair from:', KEYPAIR_PATH);
    console.error('   Make sure the file exists and is a valid Solana keypair JSON');
    console.error('');
    console.error('💡 You can set a custom path:');
    console.error('   export FEE_RECEIVER_KEYPAIR=/path/to/your/keypair.json');
    process.exit(1);
  }
  
  console.log('');
  
  // Check current SOL balance
  console.log('📊 Checking balances...');
  const solBalance = await connection.getBalance(FEE_RECEIVER_WALLET);
  console.log(`   Current SOL balance: ${(solBalance / 1e9).toFixed(9)} SOL`);
  
  // Check WSOL account
  try {
    const wsolAccount = await getAccount(connection, FEE_RECEIVER_WSOL_ACCOUNT);
    const wsolBalance = Number(wsolAccount.amount);
    const wsolBalanceSOL = wsolBalance / 1e9;
    
    console.log(`   WSOL token balance: ${wsolBalanceSOL.toFixed(9)} SOL (wrapped)`);
    console.log('');
    
    if (wsolBalance === 0) {
      console.log('✅ No WSOL to unwrap. Account is empty.');
      console.log('');
      console.log('💡 This is normal if:');
      console.log('   - You already unwrapped the fees');
      console.log('   - No pools have been created yet');
      console.log('   - The pool creation fee is set to 0');
      return;
    }
    
    console.log('🔄 Unwrapping WSOL to SOL...');
    console.log(`   This will close the WSOL account and return ${wsolBalanceSOL.toFixed(9)} SOL to your wallet`);
    console.log('');
    
    // Close the WSOL account (this unwraps the SOL)
    const signature = await closeAccount(
      connection,
      feeReceiverKeypair,          // Payer (also owner)
      FEE_RECEIVER_WSOL_ACCOUNT,   // WSOL account to close
      FEE_RECEIVER_WALLET,         // Destination for remaining SOL
      feeReceiverKeypair,          // Owner of the WSOL account
      []
    );
    
    console.log('✅ Transaction sent!');
    console.log('📜 Signature:', signature);
    console.log('🔗 Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log('');
    
    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    await connection.confirmTransaction(signature, 'confirmed');
    
    // Check new balance
    const newSolBalance = await connection.getBalance(FEE_RECEIVER_WALLET);
    const increase = (newSolBalance - solBalance) / 1e9;
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 SUCCESS! WSOL has been unwrapped to SOL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📊 Final Balance:');
    console.log(`   Previous: ${(solBalance / 1e9).toFixed(9)} SOL`);
    console.log(`   Current:  ${(newSolBalance / 1e9).toFixed(9)} SOL`);
    console.log(`   Increase: +${increase.toFixed(9)} SOL`);
    console.log('');
    console.log('💡 The WSOL account has been closed and the SOL is now in your wallet!');
    
  } catch (error: any) {
    if (error.message?.includes('could not find account')) {
      console.log('ℹ️  WSOL account does not exist yet.');
      console.log('');
      console.log('💡 This is normal if:');
      console.log('   - No pools have been created yet');
      console.log('   - The account was already closed (fees already collected)');
    } else {
      console.error('❌ Error:', error.message || error);
    }
  }
}

main()
  .then(() => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

