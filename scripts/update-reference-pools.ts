import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

/**
 * Script to update reference pool addresses in ProtocolTokenConfig
 * This fixes the AccountDiscriminatorMismatch error by ensuring the contract
 * reads pools created by the NEW program, not the old one
 */

async function main() {
  // Configuration
  const PROGRAM_ID = new PublicKey('4LyaQt2uNYX7zJABAVa56th8U68brWHWLioAYZSbCeEf');
  const PROTOCOL_TOKEN_MINT = new PublicKey('22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx'); // KEDOLOG
  const AMM_CONFIG = new PublicKey('BvNxXvJbJLgEhSCuoVyHwsTWZeFMLfwdzqP1ynuimVRW');
  
  // NEW pool addresses (from frontend addresses.ts)
  const KEDOLOG_USDC_POOL = new PublicKey('BE1AdLaWKGPV61cmdV2W6aw7GY5fBRc59noUascPBje');
  const SOL_USDC_POOL = new PublicKey('4pS9NNCmuSxCeE2KStwnVLujouoAPRuFjnmKd12fjs1U');
  const KEDOLOG_SOL_POOL = new PublicKey('DLUJbJopAcZXvu7a2g8sY2CrqJyjtRx48G6M1WbFGiBn');

  // RPC connection
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
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
  
  // Derive ProtocolTokenConfig PDA
  // NOTE: Only uses "protocol_token_config" seed, no other parameters!
  const [protocolTokenConfig] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('protocol_token_config'),
    ],
    PROGRAM_ID
  );
  
  console.log('📋 ProtocolTokenConfig:', protocolTokenConfig.toString());
  
  // Fetch current config
  const config = await program.account.protocolTokenConfig.fetch(protocolTokenConfig);
  console.log('\n📊 Current Configuration:');
  console.log('  KEDOLOG/USDC Pool:', config.kedologUsdcPool?.toString() || 'Not set');
  console.log('  SOL/USDC Pool:', config.solUsdcPool?.toString() || 'Not set');
  console.log('  KEDOLOG/SOL Pool:', config.kedologSolPool?.toString() || 'Not set');
  
  // Update the pools
  console.log('\n🔄 Updating reference pools...');
  
  try {
    const tx = await program.methods
      .updateProtocolTokenConfig(
        null, // discount_rate (don't change)
        null, // treasury (don't change)
        KEDOLOG_USDC_POOL, // kedolog_usdc_pool
        SOL_USDC_POOL, // sol_usdc_pool
        KEDOLOG_SOL_POOL // kedolog_sol_pool
      )
      .accounts({
        protocolTokenConfig,
        authority: adminKeypair.publicKey,
      })
      .rpc();
    
    console.log('✅ Pools updated! Transaction:', tx);
    
    // Verify update
    const updatedConfig = await program.account.protocolTokenConfig.fetch(protocolTokenConfig);
    console.log('\n✅ Updated Configuration:');
    console.log('  KEDOLOG/USDC Pool:', updatedConfig.kedologUsdcPool.toString());
    console.log('  SOL/USDC Pool:', updatedConfig.solUsdcPool.toString());
    console.log('  KEDOLOG/SOL Pool:', updatedConfig.kedologSolPool.toString());
    
  } catch (error) {
    console.error('❌ Error updating pools:', error);
    throw error;
  }
}

main()
  .then(() => {
    console.log('\n🎉 Reference pools updated successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

