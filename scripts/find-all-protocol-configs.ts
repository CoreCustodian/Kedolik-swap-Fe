import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

/**
 * Find ALL possible ProtocolTokenConfig PDAs and check which ones exist
 */

async function main() {
  const PROGRAM_ID = new PublicKey('4LyaQt2uNYX7zJABAVa56th8U68brWHWLioAYZSbCeEf');
  const KEDOLOG_MINT = new PublicKey('22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx');
  const AMM_CONFIG = new PublicKey('BvNxXvJbJLgEhSCuoVyHwsTWZeFMLfwdzqP1ynuimVRW');
  
  // Get RPC from environment variable (REQUIRED)
  const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT;
  if (!RPC_ENDPOINT) {
    console.error('❌ ERROR: VITE_RPC_ENDPOINT is not set in environment!');
    console.error('💡 Please set it in your .env file or export it:');
    console.error('   export VITE_RPC_ENDPOINT=https://your-quicknode-endpoint.solana-mainnet.quiknode.pro/your-key/');
    process.exit(1);
  }
  
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  
  console.log('🔍 Searching for ALL possible ProtocolTokenConfig PDAs...');
  console.log('');
  
  // Try different PDA derivations
  const derivations = [
    {
      name: 'Just "protocol_token_config"',
      seeds: [Buffer.from('protocol_token_config')],
    },
    {
      name: 'protocol_token_config + AMM_CONFIG',
      seeds: [Buffer.from('protocol_token_config'), AMM_CONFIG.toBuffer()],
    },
    {
      name: 'protocol_token_config + KEDOLOG_MINT',
      seeds: [Buffer.from('protocol_token_config'), KEDOLOG_MINT.toBuffer()],
    },
    {
      name: 'protocol_token_config + AMM_CONFIG + KEDOLOG_MINT',
      seeds: [Buffer.from('protocol_token_config'), AMM_CONFIG.toBuffer(), KEDOLOG_MINT.toBuffer()],
    },
  ];
  
  console.log('Checking all possible derivations:');
  console.log('');
  
  for (const derivation of derivations) {
    try {
      const [pda, bump] = PublicKey.findProgramAddressSync(derivation.seeds, PROGRAM_ID);
      
      console.log(`📍 ${derivation.name}:`);
      console.log(`   PDA: ${pda.toString()}`);
      console.log(`   Bump: ${bump}`);
      
      // Check if this account exists
      const accountInfo = await connection.getAccountInfo(pda);
      
      if (accountInfo) {
        console.log(`   ✅ ACCOUNT EXISTS!`);
        console.log(`   Owner: ${accountInfo.owner.toString()}`);
        console.log(`   Data length: ${accountInfo.data.length}`);
        
        if (accountInfo.owner.equals(PROGRAM_ID)) {
          console.log(`   ✅ Owned by correct program!`);
          
          // Try to read the config
          try {
            const discriminator = accountInfo.data.slice(0, 8);
            console.log(`   Discriminator: ${Buffer.from(discriminator).toString('hex')}`);
            
            // Read pool addresses (assuming they're at fixed offsets)
            // This is a rough guess, actual layout may vary
            if (accountInfo.data.length >= 100) {
              console.log(`   ℹ️  This config has data, might contain pool addresses`);
            }
          } catch (e) {
            console.log(`   ⚠️  Could not parse config data`);
          }
        } else {
          console.log(`   ❌ Owned by different program: ${accountInfo.owner.toString()}`);
        }
      } else {
        console.log(`   ❌ Account does not exist`);
      }
      
      console.log('');
    } catch (error) {
      console.log(`   ❌ Error deriving PDA: ${error.message}`);
      console.log('');
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Frontend uses: 3TLoGQXLQyyExNUekdtjinSig9uBnrwLZXHbJ4ECBrq3');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

