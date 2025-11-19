import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Verify that ProtocolTokenConfig was created by the correct program
 */

async function main() {
  const PROGRAM_ID = new PublicKey('4LyaQt2uNYX7zJABAVa56th8U68brWHWLioAYZSbCeEf');
  const PROTOCOL_TOKEN_CONFIG = new PublicKey('3TLoGQXLQyyExNUekdtjinSig9uBnrwLZXHbJ4ECBrq3');
  
  // Get RPC from environment variable (REQUIRED)
  const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT;
  if (!RPC_ENDPOINT) {
    console.error('❌ ERROR: VITE_RPC_ENDPOINT is not set in environment!');
    console.error('💡 Please set it in your .env file or export it:');
    console.error('   export VITE_RPC_ENDPOINT=https://your-quicknode-endpoint.solana-mainnet.quiknode.pro/your-key/');
    process.exit(1);
  }
  
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  
  console.log('🔍 Checking ProtocolTokenConfig account...');
  console.log('Config:', PROTOCOL_TOKEN_CONFIG.toString());
  console.log('Expected Owner (Program):', PROGRAM_ID.toString());
  console.log('');
  
  try {
    const accountInfo = await connection.getAccountInfo(PROTOCOL_TOKEN_CONFIG);
    
    if (!accountInfo) {
      console.log('❌ ProtocolTokenConfig account does not exist!');
      console.log('');
      console.log('🎯 SOLUTION: Run createProtocolTokenConfig on the NEW program!');
      return;
    }
    
    console.log('✅ ProtocolTokenConfig account exists');
    console.log('  Owner:', accountInfo.owner.toString());
    console.log('  Data length:', accountInfo.data.length);
    console.log('  Lamports:', accountInfo.lamports);
    console.log('');
    
    if (accountInfo.owner.toString() === PROGRAM_ID.toString()) {
      console.log('✅ ProtocolTokenConfig is owned by the CORRECT program!');
      console.log('');
      console.log('  Discriminator:', Buffer.from(accountInfo.data.slice(0, 8)).toString('hex'));
      console.log('');
      console.log('✅ This config should work!');
    } else {
      console.log('❌ ProtocolTokenConfig is owned by a DIFFERENT program!');
      console.log('');
      console.log('🔴 THIS IS THE PROBLEM!');
      console.log('');
      console.log('The ProtocolTokenConfig was created by program:', accountInfo.owner.toString());
      console.log('But your contract expects program:', PROGRAM_ID.toString());
      console.log('');
      console.log('When the contract tries to read this config, it gets AccountDiscriminatorMismatch!');
      console.log('');
      console.log('🎯 SOLUTION: Create a NEW ProtocolTokenConfig with the NEW program!');
      console.log('');
      console.log('Run on contract server:');
      console.log('  npx ts-node scripts/create-protocol-token-config.ts');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

