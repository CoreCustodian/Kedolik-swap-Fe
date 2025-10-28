/**
 * Initialize AMM Configs (Fee Tiers)
 * 
 * This script creates all AMM config accounts on-chain.
 * Must be run by the admin wallet: GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ
 * 
 * Usage:
 * 1. Make sure admin wallet is connected in Phantom
 * 2. Run: npm run init-configs (or node scripts/init-amm-configs.ts)
 * 3. Approve all transactions in Phantom
 */

import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, Idl } from '@coral-xyz/anchor';
import BN from 'bn.js';
import idl from '../kedolik_cp_swap.json';
import { FEE_TIER_CONFIGS } from '../src/config/fees';

const PROGRAM_ID = new PublicKey('GCm8bqvSuJ4nwj3SN3pk2eSJWTwcRjkU6KhXE96AnBod');
const RPC_URL = 'https://api.devnet.solana.com';
const ADMIN_PUBKEY = new PublicKey('GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ');

interface AmmConfigParams {
  index: number;
  tradeFeeRate: number;    // basis points (e.g., 100 = 1%, 30 = 0.3%)
  protocolFeeRate: number; // basis points (e.g., 2000 = 20% of trade fee)
  fundFeeRate: number;     // basis points (e.g., 1000 = 10% of trade fee)
  createPoolFee: number;   // lamports (e.g., 0.01 SOL = 10_000_000 lamports)
  creatorFeeRate: number;  // basis points (e.g., 500 = 5% of trade fee)
}

/**
 * AMM Configurations based on Raydium Fee Structure
 * 
 * Fee Distribution (CP-Swap style):
 * - Liquidity Providers: 84% of trading fees
 * - Protocol (RAY buybacks): 12% of trading fees  
 * - Treasury: 4% of trading fees
 * 
 * This results in:
 * - protocolFeeRate: 1200 (12% of trade fee)
 * - fundFeeRate: 400 (4% of trade fee)
 * - creatorFeeRate: 0 (pool creators don't get fees)
 */
const AMM_CONFIGS: AmmConfigParams[] = [
  // Tier 0: 0.01% - For ultra-stable pairs (CLMM style)
  {
    index: 0,
    tradeFeeRate: 1,        // 0.01% trade fee (1 basis point)
    protocolFeeRate: 1200,  // 12% of trade fee to protocol
    fundFeeRate: 400,        // 4% of trade fee to treasury
    createPoolFee: 10_000_000, // 0.01 SOL to create pool
    creatorFeeRate: 0        // No creator fee (0%)
  },
  // Tier 1: 0.05% - For stable pairs
  {
    index: 1,
    tradeFeeRate: 5,        // 0.05% trade fee
    protocolFeeRate: 1200,  // 12% of trade fee to protocol
    fundFeeRate: 400,       // 4% of trade fee to treasury
    createPoolFee: 10_000_000,
    creatorFeeRate: 0       // No creator fee
  },
  // Tier 2: 0.25% - Standard AMM fee (Raydium standard)
  // 0.22% to LPs, 0.03% to protocol (12% of 0.25%)
  {
    index: 2,
    tradeFeeRate: 25,       // 0.25% trade fee (25 basis points)
    protocolFeeRate: 1200,  // 12% of trade fee to protocol
    fundFeeRate: 400,       // 4% of trade fee to treasury
    createPoolFee: 10_000_000,
    creatorFeeRate: 0       // No creator fee
  },
  // Tier 3: 1.00% - For volatile pairs
  {
    index: 3,
    tradeFeeRate: 100,      // 1.00% trade fee
    protocolFeeRate: 1200,  // 12% of trade fee to protocol
    fundFeeRate: 400,       // 4% of trade fee to treasury
    createPoolFee: 10_000_000,
    creatorFeeRate: 0       // No creator fee
  }
];

/**
 * Get AMM config PDA address
 */
function getAmmConfigAddress(index: number): PublicKey {
  const indexBuffer = Buffer.alloc(2);
  indexBuffer.writeUInt16LE(index, 0);
  
  const [ammConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('amm_config'), indexBuffer],
    PROGRAM_ID
  );
  
  return ammConfig;
}

/**
 * Check if AMM config already exists
 */
async function checkAmmConfigExists(
  connection: Connection,
  index: number
): Promise<boolean> {
  try {
    const ammConfigAddress = getAmmConfigAddress(index);
    const accountInfo = await connection.getAccountInfo(ammConfigAddress);
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Create a single AMM config
 */
async function createAmmConfig(
  program: Program,
  config: AmmConfigParams,
  wallet: Wallet
): Promise<string> {
  const ammConfigAddress = getAmmConfigAddress(config.index);
  
  console.log(`\n🔧 Creating AMM Config ${config.index}:`);
  console.log(`   Trade Fee: ${config.tradeFeeRate / 100}%`);
  console.log(`   Address: ${ammConfigAddress.toString()}`);
  
  try {
    const tx = await program.methods
      .createAmmConfig(
        config.index,
        new BN(config.tradeFeeRate),
        new BN(config.protocolFeeRate),
        new BN(config.fundFeeRate),
        new BN(config.createPoolFee),
        new BN(config.creatorFeeRate)
      )
      .accounts({
        owner: wallet.publicKey,
        ammConfig: ammConfigAddress,
        systemProgram: PublicKey.default, // Will use the correct system program
      })
      .rpc();
    
    console.log(`   ✅ Created! TX: ${tx}`);
    console.log(`   🔗 Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    return tx;
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Main function to initialize all AMM configs
 */
async function main() {
  console.log('🚀 Initializing AMM Configs (Fee Tiers)');
  console.log('==========================================\n');
  console.log(`Program ID: ${PROGRAM_ID.toString()}`);
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Admin: ${ADMIN_PUBKEY.toString()}\n`);
  
  // Check if running in browser or node
  if (typeof window === 'undefined') {
    console.error('❌ This script must be run in the browser with wallet extension!');
    console.error('📝 Instructions:');
    console.error('   1. Copy this script content');
    console.error('   2. Open browser console on your DEX app');
    console.error('   3. Make sure admin wallet is connected');
    console.error('   4. Paste and run the script\n');
    return;
  }
  
  // @ts-ignore - window.solana from Phantom
  if (!window.solana || !window.solana.isConnected) {
    throw new Error('❌ Phantom wallet not connected! Please connect your admin wallet first.');
  }
  
  // @ts-ignore
  const wallet = window.solana;
  
  if (wallet.publicKey.toString() !== ADMIN_PUBKEY.toString()) {
    throw new Error(`❌ Wrong wallet! Expected admin: ${ADMIN_PUBKEY.toString()}, got: ${wallet.publicKey.toString()}`);
  }
  
  console.log('✅ Admin wallet connected\n');
  
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Create Anchor provider and program
  const provider = new AnchorProvider(
    connection,
    wallet as any,
    { commitment: 'confirmed' }
  );
  
  const program = new Program(idl as Idl, provider);
  
  console.log('📋 Checking existing configs...\n');
  
  // Check which configs already exist
  const existingConfigs: boolean[] = [];
  for (const config of AMM_CONFIGS) {
    const exists = await checkAmmConfigExists(connection, config.index);
    existingConfigs.push(exists);
    
    if (exists) {
      console.log(`   ⏭️  Config ${config.index} (${config.tradeFeeRate / 100}%) already exists - skipping`);
    }
  }
  
  console.log('\n🔨 Creating missing configs...\n');
  
  // Create missing configs
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < AMM_CONFIGS.length; i++) {
    const config = AMM_CONFIGS[i];
    
    if (existingConfigs[i]) {
      skipped++;
      continue;
    }
    
    try {
      await createAmmConfig(program, config, wallet as any);
      created++;
      
      // Wait a bit between transactions
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      errors.push(`Config ${config.index}: ${error.message}`);
    }
  }
  
  // Summary
  console.log('\n==========================================');
  console.log('📊 SUMMARY');
  console.log('==========================================');
  console.log(`✅ Created: ${created}`);
  console.log(`⏭️  Skipped (already exist): ${skipped}`);
  console.log(`❌ Errors: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(err => console.log(`   ${err}`));
  }
  
  if (created > 0 || skipped > 0) {
    console.log('\n✅ All done! You can now create pools with these fee tiers:');
    FEE_TIER_CONFIGS.forEach(config => {
      const address = getAmmConfigAddress(config.index);
      console.log(`   ${config.label} - ${address.toString()}`);
    });
  }
  
  console.log('\n🎉 AMM config initialization complete!\n');
}

// Run if in browser
if (typeof window !== 'undefined') {
  main().catch(err => {
    console.error('💥 Fatal error:', err);
  });
}

export { main, createAmmConfig, checkAmmConfigExists, getAmmConfigAddress, AMM_CONFIGS };


