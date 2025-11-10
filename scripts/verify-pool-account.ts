import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Verify that a pool account was created by the correct program
 */

async function main() {
  const PROGRAM_ID = new PublicKey('4LyaQt2uNYX7zJABAVa56th8U68brWHWLioAYZSbCeEf');
  const KEDOLOG_USDC_POOL = new PublicKey('BE1AdLaWKGPV61cmdV2W6aw7GY5fBRc59noUascPBje');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  console.log('🔍 Checking pool account...');
  console.log('Pool:', KEDOLOG_USDC_POOL.toString());
  console.log('Expected Owner (Program):', PROGRAM_ID.toString());
  console.log('');
  
  try {
    const accountInfo = await connection.getAccountInfo(KEDOLOG_USDC_POOL);
    
    if (!accountInfo) {
      console.log('❌ Pool account does not exist!');
      return;
    }
    
    console.log('✅ Pool account exists');
    console.log('  Owner:', accountInfo.owner.toString());
    console.log('  Data length:', accountInfo.data.length);
    console.log('  Lamports:', accountInfo.lamports);
    console.log('');
    
    if (accountInfo.owner.toString() === PROGRAM_ID.toString()) {
      console.log('✅ Pool is owned by the correct program!');
      
      // Check discriminator (first 8 bytes)
      const discriminator = accountInfo.data.slice(0, 8);
      console.log('  Discriminator:', Buffer.from(discriminator).toString('hex'));
      console.log('');
      console.log('✅ This pool should work with the contract!');
    } else {
      console.log('❌ Pool is owned by a DIFFERENT program!');
      console.log('');
      console.log('This is why you get AccountDiscriminatorMismatch!');
      console.log('The pool was created by program:', accountInfo.owner.toString());
      console.log('But your contract expects program:', PROGRAM_ID.toString());
      console.log('');
      console.log('🎯 SOLUTION: Create a NEW pool with the NEW program!');
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

