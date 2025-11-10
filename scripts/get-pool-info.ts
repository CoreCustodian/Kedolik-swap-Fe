import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import IDL from '../kedolik_cp_swap.json';

const PROGRAM_ID = '4QQN6R5AbhrUEBCLHxpJrGEmq4DHXxbcVC6eWxRh6bUR';
const RPC_URL = 'https://api.devnet.solana.com';

async function getPoolInfo(poolAddress: string) {
  const connection = new Connection(RPC_URL);
  
  try {
    const program = new anchor.Program(
      IDL as anchor.Idl,
      new PublicKey(PROGRAM_ID),
      { connection } as anchor.Provider
    );
    
    console.log('\n🔍 Fetching pool information...\n');
    
    const poolData = await program.account.poolState.fetch(
      new PublicKey(poolAddress)
    );
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ POOL INFORMATION RETRIEVED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📍 Pool Address (for price oracle):');
    console.log(poolAddress);
    console.log('\n🏦 Token Mints:');
    console.log('Token 0 (KEDOLOG):', poolData.token0Mint.toString());
    console.log('Token 1 (USDC):   ', poolData.token1Mint.toString());
    console.log('\n🔐 Vault Addresses (COPY THESE):');
    console.log('Token 0 Vault (KEDOLOG):', poolData.token0Vault.toString());
    console.log('Token 1 Vault (USDC):   ', poolData.token1Vault.toString());
    console.log('\n💰 Current Reserves:');
    console.log('Token 0 Reserve:', poolData.token0Reserve.toString());
    console.log('Token 1 Reserve:', poolData.token1Reserve.toString());
    console.log('\n🎫 LP Token:');
    console.log('LP Mint:', poolData.lpMint.toString());
    console.log('LP Supply:', poolData.lpSupply.toString());
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 UPDATE src/config/addresses.ts WITH THESE VALUES:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('// Replace lines 47, 54, 61 in src/config/addresses.ts:');
    console.log(`export const KEDOLOG_USDC_POOL = new PublicKey('${poolAddress}');`);
    console.log(`export const KEDOLOG_VAULT = new PublicKey('${poolData.token0Vault.toString()}');`);
    console.log(`export const USDC_VAULT_IN_KEDOLOG_POOL = new PublicKey('${poolData.token1Vault.toString()}');`);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('✅ Next Steps:');
    console.log('1. Copy the three export lines above');
    console.log('2. Update src/config/addresses.ts (lines 47, 54, 61)');
    console.log('3. Run: npm run build');
    console.log('4. Hard refresh browser: Ctrl+Shift+R');
    console.log('5. Set price pool: npx ts-node scripts/set-kedolog-price-pool.ts ' + poolAddress);
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error fetching pool information:');
    console.error(error);
    console.log('\n💡 Make sure:');
    console.log('1. Pool address is correct');
    console.log('2. Pool exists on devnet');
    console.log('3. RPC connection is working');
    console.log('');
    process.exit(1);
  }
}

// Parse command line arguments
const poolAddress = process.argv[2];

if (!poolAddress) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📖 USAGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('npx ts-node scripts/get-pool-info.ts <POOL_ADDRESS>\n');
  console.log('Example:');
  console.log('npx ts-node scripts/get-pool-info.ts HXfXjGqTsqhwLd4oc9ZwKpvdjGYmU8Tvbca6ftp8231w\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(1);
}

// Validate pool address
try {
  new PublicKey(poolAddress);
} catch {
  console.error('\n❌ Invalid pool address format!\n');
  console.log('Please provide a valid Solana public key.\n');
  process.exit(1);
}

getPoolInfo(poolAddress);

