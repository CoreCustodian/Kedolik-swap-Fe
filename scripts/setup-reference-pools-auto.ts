import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

/**
 * AUTO-DETECT and update reference pool addresses
 * Scans all pools from the program and automatically identifies the correct ones
 */

async function main() {
  // Configuration
  const PROGRAM_ID = new PublicKey('4LyaQt2uNYX7zJABAVa56th8U68brWHWLioAYZSbCeEf');
  const PROTOCOL_TOKEN_MINT = new PublicKey('22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx'); // KEDOLOG
  const USDC_MINT = new PublicKey('2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32');
  const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112'); // Wrapped SOL
  const AMM_CONFIG = new PublicKey('BvNxXvJbJLgEhSCuoVyHwsTWZeFMLfwdzqP1ynuimVRW');

  // RPC connection - Get from environment variable (REQUIRED)
  const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT;
  if (!RPC_ENDPOINT) {
    console.error('❌ ERROR: VITE_RPC_ENDPOINT is not set in environment!');
    console.error('💡 Please set it in your .env file or export it:');
    console.error('   export VITE_RPC_ENDPOINT=https://your-quicknode-endpoint.solana-mainnet.quiknode.pro/your-key/');
    process.exit(1);
  }
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  
  // Load admin keypair
  const keypairPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log('🔑 Admin:', adminKeypair.publicKey.toString());
  
  // Setup provider
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  
  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/kedolik_cp_swap.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  
  const program = new Program(idl, PROGRAM_ID, provider);
  
  console.log('🔍 Scanning all pools from program:', PROGRAM_ID.toString());
  
  // Fetch all pools
  const pools = await program.account.poolState.all();
  console.log(`📊 Found ${pools.length} pools`);
  
  let kedologUsdcPool: PublicKey | null = null;
  let solUsdcPool: PublicKey | null = null;
  let kedologSolPool: PublicKey | null = null;
  
  // Scan pools
  for (const pool of pools) {
    const token0 = pool.account.token0Mint || pool.account.mint0;
    const token1 = pool.account.token1Mint || pool.account.mint1;
    
    // Check KEDOLOG/USDC
    if ((token0.equals(PROTOCOL_TOKEN_MINT) && token1.equals(USDC_MINT)) ||
        (token1.equals(PROTOCOL_TOKEN_MINT) && token0.equals(USDC_MINT))) {
      kedologUsdcPool = pool.publicKey;
      console.log('✅ Found KEDOLOG/USDC pool:', pool.publicKey.toString());
    }
    
    // Check SOL/USDC
    if ((token0.equals(SOL_MINT) && token1.equals(USDC_MINT)) ||
        (token1.equals(SOL_MINT) && token0.equals(USDC_MINT))) {
      solUsdcPool = pool.publicKey;
      console.log('✅ Found SOL/USDC pool:', pool.publicKey.toString());
    }
    
    // Check KEDOLOG/SOL
    if ((token0.equals(PROTOCOL_TOKEN_MINT) && token1.equals(SOL_MINT)) ||
        (token1.equals(PROTOCOL_TOKEN_MINT) && token0.equals(SOL_MINT))) {
      kedologSolPool = pool.publicKey;
      console.log('✅ Found KEDOLOG/SOL pool:', pool.publicKey.toString());
    }
  }
  
  if (!kedologUsdcPool || !solUsdcPool || !kedologSolPool) {
    console.error('❌ Missing required pools:');
    if (!kedologUsdcPool) console.error('  - KEDOLOG/USDC pool not found');
    if (!solUsdcPool) console.error('  - SOL/USDC pool not found');
    if (!kedologSolPool) console.error('  - KEDOLOG/SOL pool not found');
    throw new Error('Required pools not found');
  }
  
  // Derive ProtocolTokenConfig PDA
  // NOTE: Only uses "protocol_token_config" seed, no other parameters!
  const [protocolTokenConfig] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('protocol_token_config'),
    ],
    PROGRAM_ID
  );
  
  console.log('\n📋 ProtocolTokenConfig:', protocolTokenConfig.toString());
  
  // Fetch current config
  try {
    const config = await program.account.protocolTokenConfig.fetch(protocolTokenConfig);
    console.log('\n📊 Current Configuration:');
    console.log('  KEDOLOG/USDC Pool:', config.kedologUsdcPool?.toString() || 'Not set');
    console.log('  SOL/USDC Pool:', config.solUsdcPool?.toString() || 'Not set');
    console.log('  KEDOLOG/SOL Pool:', config.kedologSolPool?.toString() || 'Not set');
  } catch (error) {
    console.log('\n⚠️  ProtocolTokenConfig not found or error fetching:', error.message);
  }
  
  // Update the pools
  console.log('\n🔄 Updating reference pools...');
  console.log('  KEDOLOG/USDC:', kedologUsdcPool.toString());
  console.log('  SOL/USDC:', solUsdcPool.toString());
  console.log('  KEDOLOG/SOL:', kedologSolPool.toString());
  
  try {
    const tx = await program.methods
      .updateProtocolTokenConfig(
        null, // discount_rate (don't change)
        null, // treasury (don't change)
        kedologUsdcPool, // kedolog_usdc_pool
        solUsdcPool, // sol_usdc_pool
        kedologSolPool // kedolog_sol_pool
      )
      .accounts({
        protocolTokenConfig,
        authority: adminKeypair.publicKey,
      })
      .rpc();
    
    console.log('\n✅ Pools updated! Transaction:', tx);
    
    // Verify update
    const updatedConfig = await program.account.protocolTokenConfig.fetch(protocolTokenConfig);
    console.log('\n✅ Updated Configuration:');
    console.log('  KEDOLOG/USDC Pool:', updatedConfig.kedologUsdcPool.toString());
    console.log('  SOL/USDC Pool:', updatedConfig.solUsdcPool.toString());
    console.log('  KEDOLOG/SOL Pool:', updatedConfig.kedologSolPool.toString());
    
    console.log('\n🎉 All reference pools configured successfully!');
    console.log('✅ Frontend can now perform KEDOLOG discount swaps!');
    
  } catch (error) {
    console.error('\n❌ Error updating pools:', error);
    throw error;
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

