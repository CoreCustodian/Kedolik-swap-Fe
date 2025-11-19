import { Connection, PublicKey } from '@solana/web3.js';

const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('Ekrrwc7LN33kAkttTGHXM51kHFRbBg9g3ZH7EaJwta1Z');

async function verifyProgram() {
  console.log('🔍 Verifying program on devnet...\n');
  console.log('📡 RPC:', RPC_ENDPOINT);
  console.log('📍 Program ID:', PROGRAM_ID.toString());
  console.log('');
  
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  
  try {
    const accountInfo = await connection.getAccountInfo(PROGRAM_ID);
    
    if (!accountInfo) {
      console.error('❌ Program does NOT exist on devnet!');
      console.error('💡 Make sure the program is deployed to devnet with this ID.');
      process.exit(1);
    }
    
    console.log('✅ Program exists!');
    console.log('   Owner:', accountInfo.owner.toString());
    console.log('   Executable:', accountInfo.executable);
    console.log('   Data length:', accountInfo.data.length, 'bytes');
    console.log('   Lamports:', accountInfo.lamports / 1e9, 'SOL');
    
  } catch (error: any) {
    console.error('❌ Error checking program:', error.message);
    process.exit(1);
  }
}

verifyProgram();

