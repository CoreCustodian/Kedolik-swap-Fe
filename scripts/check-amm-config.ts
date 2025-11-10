import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import IDL from '../kedolik_cp_swap.json';

const PROGRAM_ID = '2LVtzKZ7DwoowxeKnwmia6JGKdZy9cjAzH62RrburWtq';
const AMM_CONFIG = 'GQfc8j8R1xDR9aTV68YwYWHoprVkzvWDfDg5FCPLToqD';
const RPC_URL = 'https://api.devnet.solana.com';

async function checkAmmConfig() {
  const connection = new Connection(RPC_URL);
  
  try {
    const program = new anchor.Program(
      IDL as anchor.Idl,
      new PublicKey(PROGRAM_ID),
      { connection } as anchor.Provider
    );
    
    console.log('\n🔍 Fetching AMM Config...\n');
    
    const configData = await program.account.ammConfig.fetch(
      new PublicKey(AMM_CONFIG)
    );
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ AMM CONFIG DATA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Config Address:', AMM_CONFIG);
    console.log('\n📋 All Fields:');
    console.log(JSON.stringify(configData, null, 2));
    
    console.log('\n🔑 Key Addresses:');
    if (configData.protocolOwner) {
      console.log('Protocol Owner (Admin):', configData.protocolOwner.toString());
    }
    if (configData.feeReceiver) {
      console.log('Fee Receiver (Unified):', configData.feeReceiver.toString());
    }
    if (configData.fundOwner) {
      console.log('Fund Owner (Old field):', configData.fundOwner.toString());
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('💡 Use this address for pool creation fee:');
    const feeReceiver = configData.feeReceiver?.toString() || configData.fundOwner?.toString();
    console.log(feeReceiver);
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error fetching AMM config:');
    console.error(error);
    console.log('');
    process.exit(1);
  }
}

checkAmmConfig();

