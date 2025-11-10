import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { BN } from 'bn.js';

// Configuration
const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('2LVtzKZ7DwoowxeKnwmia6JGKdZy9cjAzH62RrburWtq');
const PROTOCOL_TOKEN_CONFIG = new PublicKey('tos6BKcSK6kMyHcaqStP3pUcQjq1mXgdDqTBPj7s8MH');
const KEDOLOG_USDC_POOL = new PublicKey('H3dg1Je7wA4tGmtLxrQcsFUBnVKth2dNUGPceC1Jiuus');

async function main() {
  console.log('🔧 Setting KEDOLOG price pool...\n');
  
  // Load wallet
  const walletPath = process.env.WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');
  console.log(`📁 Loading wallet from: ${walletPath}`);
  
  const keypairData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  console.log(`👤 Wallet: ${keypair.publicKey.toString()}\n`);
  
  // Setup connection and provider
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  
  // Load IDL
  const idlPath = path.join(__dirname, '../kedolik_cp_swap.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  
  // Create program
  const program = new Program(idl, PROGRAM_ID, provider);
  
  console.log('📋 Configuration:');
  console.log(`  Program ID: ${PROGRAM_ID.toString()}`);
  console.log(`  Protocol Token Config: ${PROTOCOL_TOKEN_CONFIG.toString()}`);
  console.log(`  KEDOLOG/USDC Pool: ${KEDOLOG_USDC_POOL.toString()}\n`);
  
  // Fetch current config
  console.log('📖 Current config:');
  const configData = await (program.account as any).protocolTokenConfig.fetch(PROTOCOL_TOKEN_CONFIG);
  console.log(`  Authority: ${configData.authority.toString()}`);
  console.log(`  Treasury: ${configData.treasury.toString()}`);
  console.log(`  Protocol Token: ${configData.protocolTokenMint.toString()}`);
  console.log(`  Discount Rate: ${configData.discountRate.toString()} (${configData.discountRate.toNumber() / 100}%)`);
  console.log(`  Current Price Pool: ${configData.pricePool ? configData.pricePool.toString() : 'Not set'}\n`);
  
  // Update price pool
  console.log('🔄 Updating price pool...');
  
  try {
    const tx = await (program.methods as any)
      .updateProtocolTokenConfig(
        new BN(0), // param 0 = don't update discount rate
        new BN(0), // padding
        new BN(0)  // padding
      )
      .accounts({
        owner: keypair.publicKey,
        protocolTokenConfig: PROTOCOL_TOKEN_CONFIG,
      })
      .remainingAccounts([
        // Pass the price pool address in remaining accounts
        { pubkey: KEDOLOG_USDC_POOL, isSigner: false, isWritable: false },
      ])
      .rpc();
    
    console.log(`✅ Transaction successful: ${tx}`);
    console.log(`🔗 Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet\n`);
    
    // Verify update
    console.log('🔍 Verifying update...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for confirmation
    
    const updatedConfig = await (program.account as any).protocolTokenConfig.fetch(PROTOCOL_TOKEN_CONFIG);
    console.log(`  Updated Price Pool: ${updatedConfig.pricePool.toString()}`);
    
    if (updatedConfig.pricePool.toString() === KEDOLOG_USDC_POOL.toString()) {
      console.log('\n✅ Price pool set successfully!');
      console.log('\n📝 Next steps:');
      console.log('  1. Rebuild the frontend: npm run build');
      console.log('  2. Hard refresh browser: Ctrl+Shift+R');
      console.log('  3. Test KEDOLOG discount swap\n');
    } else {
      console.error('\n❌ Price pool not updated correctly!');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error updating price pool:', error);
    if (error.logs) {
      console.error('Program logs:', error.logs);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

