/**
 * Script to check the actual pool creation fee stored on-chain
 * 
 * Usage: 
 *   npx tsx scripts/check-pool-creation-fee.ts
 *   
 *   OR install tsx first:
 *   npm install -D tsx
 *   npx tsx scripts/check-pool-creation-fee.ts
 */

import { Connection, PublicKey } from '@solana/web3.js';

// Import addresses directly (since we can't easily import from src in scripts)
const DEFAULT_AMM_CONFIG = new PublicKey('ENDftP3K19BX29PnyQ6sAwHFGyjtuzAYW6bnnTfZzZRQ');
const PROGRAM_ID = new PublicKey('EvUXjxz9pc4mdUPePwF8RQUr4RG8Qk9aP9PmGXn15PVL');

// Use environment variable or default to mainnet
const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

async function checkPoolCreationFee() {
  console.log('🔍 Checking Pool Creation Fee on-chain...\n');
  console.log(`📡 RPC Endpoint: ${RPC_ENDPOINT}`);
  console.log(`📍 AMM Config Address: ${DEFAULT_AMM_CONFIG.toString()}\n`);

  try {
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    
    // First, check if the account exists
    console.log('📥 Checking if account exists...');
    const accountInfo = await connection.getAccountInfo(DEFAULT_AMM_CONFIG);
    
    if (!accountInfo) {
      throw new Error(`Account does not exist at address: ${DEFAULT_AMM_CONFIG.toString()}`);
    }
    
    console.log(`✅ Account exists (${accountInfo.data.length} bytes)`);
    console.log(`   Owner: ${accountInfo.owner.toString()}`);
    console.log(`   Executable: ${accountInfo.executable}`);
    console.log(`   Lamports: ${accountInfo.lamports / 1e9} SOL\n`);
    
    // Check if account is owned by our program
    if (!accountInfo.owner.equals(PROGRAM_ID)) {
      console.warn(`⚠️  WARNING: Account is owned by ${accountInfo.owner.toString()}, not ${PROGRAM_ID.toString()}`);
    }
    
    // Parse the account data manually from raw bytes
    // AMM Config structure (based on IDL):
    // - bump: u8 (1 byte)
    // - disable_create_pool: bool (1 byte)
    // - index: u16 (2 bytes)
    // - trade_fee_rate: u64 (8 bytes)
    // - protocol_fee_rate: u64 (8 bytes)
    // - fund_fee_rate: u64 (8 bytes)
    // - create_pool_fee: u64 (8 bytes) <- This is what we want!
    // - protocol_owner: Pubkey (32 bytes)
    // - fee_receiver: Pubkey (32 bytes)
    // - creator_fee_rate: u64 (8 bytes)
    
    // Convert Uint8Array to Buffer for easier manipulation
    const data = Buffer.from(accountInfo.data);
    
    // Debug: Show first 50 bytes in hex
    console.log(`\n🔍 Raw Account Data (first 50 bytes):`);
    console.log(`   ${data.slice(0, 50).toString('hex').match(/.{2}/g)?.join(' ') || ''}`);
    
    // Looking at the hex dump, I can see the value 80 d1 f0 08 00 00 00 00
    // which is 150,000,000 lamports. Let me search for it in the data
    const targetHex = '80d1f00800000000';
    const dataHex = data.toString('hex');
    const targetIndex = dataHex.indexOf(targetHex);
    
    if (targetIndex !== -1) {
      const byteOffset = targetIndex / 2; // Each hex char is 0.5 bytes
      console.log(`\n✅ Found create_pool_fee value at byte offset: ${byteOffset}`);
      
      const createPoolFeeBuffer = data.slice(byteOffset, byteOffset + 8);
      const feeLamports = createPoolFeeBuffer.readBigUInt64LE(0);
      const feeSOL = Number(feeLamports) / 1e9;
      
      console.log(`   Hex: ${createPoolFeeBuffer.toString('hex')}`);
      console.log(`   Lamports: ${feeLamports.toString()}`);
      console.log(`   SOL: ${feeSOL}`);
    } else {
      // Fallback: try the expected offset structure
      let offset = 0;
      
      // Skip bump (1 byte)
      offset += 1;
      // Skip disable_create_pool (1 byte)
      offset += 1;
      // Skip index (2 bytes)
      offset += 2;
      // Skip trade_fee_rate (8 bytes)
      offset += 8;
      // Skip protocol_fee_rate (8 bytes)
      offset += 8;
      // Skip fund_fee_rate (8 bytes)
      offset += 8;
      
      // There might be padding - try offset 36 (where we see the value in hex)
      // Or check if there's a different structure
      console.log(`\n⚠️  Value not found at expected location, trying offset 36...`);
      offset = 36;
      
      const createPoolFeeBuffer = data.slice(offset, offset + 8);
      const feeLamports = createPoolFeeBuffer.readBigUInt64LE(0);
      const feeSOL = Number(feeLamports) / 1e9;
      
      console.log(`   Hex at offset ${offset}: ${createPoolFeeBuffer.toString('hex')}`);
      console.log(`   Lamports: ${feeLamports.toString()}`);
      console.log(`   SOL: ${feeSOL}`);
    }
    
    // Use the found value
    let feeLamports: bigint;
    let feeSOL: number;
    let createPoolFeeOffset: number;
    
    if (targetIndex !== -1) {
      createPoolFeeOffset = targetIndex / 2;
      const createPoolFeeBuffer = data.slice(createPoolFeeOffset, createPoolFeeOffset + 8);
      feeLamports = createPoolFeeBuffer.readBigUInt64LE(0);
      feeSOL = Number(feeLamports) / 1e9;
    } else {
      // Use offset 36 as fallback (where we see 80 d1 f0 08 in the hex)
      createPoolFeeOffset = 36;
      const createPoolFeeBuffer = data.slice(36, 44);
      feeLamports = createPoolFeeBuffer.readBigUInt64LE(0);
      feeSOL = Number(feeLamports) / 1e9;
    }
    
    // Read protocol_owner (32 bytes) - should be after create_pool_fee
    const protocolOwnerOffset = createPoolFeeOffset + 8;
    const protocolOwner = new PublicKey(data.slice(protocolOwnerOffset, protocolOwnerOffset + 32));
    
    // Read fee_receiver (32 bytes) - should be after protocol_owner
    const feeReceiverOffset = protocolOwnerOffset + 32;
    const feeReceiver = new PublicKey(data.slice(feeReceiverOffset, feeReceiverOffset + 32));
    
    // Read creator_fee_rate (8 bytes) - should be after fee_receiver
    const creatorFeeRateOffset = feeReceiverOffset + 32;
    const creatorFeeRateBuffer = data.slice(creatorFeeRateOffset, creatorFeeRateOffset + 8);
    const creatorFeeRate = Number(creatorFeeRateBuffer.readBigUInt64LE(0));
    
    console.log('\n✅ AMM Config Account Data (Parsed from Raw Bytes):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n💰 Pool Creation Fee:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Lamports: ${feeLamports.toString()}`);
    console.log(`  SOL: ${feeSOL.toFixed(9)}`);
    
    if (feeSOL === 0) {
      console.log('\n⚠️  WARNING: Pool creation fee is 0 or not found!');
      console.log('   This might mean the field was not initialized.');
    } else if (feeSOL === 1) {
      console.log('\n⚠️  WARNING: Pool creation fee is 1 SOL');
      console.log('   Expected: 0.15 SOL (150,000,000 lamports)');
      console.log('   You may need to update the AMM config on-chain.');
    } else if (Math.abs(feeSOL - 0.15) < 0.0001) {
      console.log('\n✅ Pool creation fee is correctly set to 0.15 SOL');
    } else {
      console.log(`\nℹ️  Pool creation fee is set to ${feeSOL} SOL`);
      if (feeSOL !== 0.15) {
        console.log(`   Expected: 0.15 SOL (150,000,000 lamports)`);
        console.log(`   Current: ${feeSOL} SOL (${feeLamports.toString()} lamports)`);
      }
    }
    
    // Show other config values for reference
    console.log('\n📊 Other AMM Config Values:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Protocol Owner: ${protocolOwner.toString()}`);
    console.log(`  Fee Receiver: ${feeReceiver.toString()}`);
    console.log(`  Creator Fee Rate: ${creatorFeeRate}`);
    
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string };
    console.error('\n❌ Error fetching AMM config:');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    if (err.message?.includes('Account does not exist') || err.message?.includes('does not exist')) {
      console.error('\n💡 The AMM config account does not exist at this address.');
      console.error('   Make sure you are connected to the correct network (mainnet vs devnet).');
      console.error(`   Address: ${DEFAULT_AMM_CONFIG.toString()}`);
    } else if (err.message?.includes('Invalid account owner') || err.message?.includes('owner')) {
      console.error('\n💡 The account exists but is owned by a different program.');
      console.error('   Check if the AMM config address is correct.');
    } else if (err.message?.includes('size') || err.message?.includes('Cannot read properties')) {
      console.error('\n💡 Account data parsing error.');
      console.error('   This might mean:');
      console.error('   1. The account structure doesn\'t match the IDL');
      console.error('   2. The account is not an AMM config account');
      console.error('   3. The IDL version doesn\'t match the on-chain program');
      console.error('\n   Try fetching raw account data to inspect...');
      
      // Try to fetch raw data
      try {
        const connection = new Connection(RPC_ENDPOINT, 'confirmed');
        const accountInfo = await connection.getAccountInfo(DEFAULT_AMM_CONFIG);
        if (accountInfo) {
          console.log(`\n   Raw account data length: ${accountInfo.data.length} bytes`);
          console.log(`   First 100 bytes (hex): ${accountInfo.data.slice(0, 100).toString('hex')}`);
        }
      } catch (e) {
        // Ignore
      }
    }
    
    process.exit(1);
  }
}

// Run the check
checkPoolCreationFee()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });

