import { PublicKey } from '@solana/web3.js';

/**
 * Quick script to verify the ProtocolTokenConfig PDA address
 */

const PROGRAM_ID = new PublicKey('4LyaQt2uNYX7zJABAVa56th8U68brWHWLioAYZSbCeEf');

// Derive PDA
const [protocolTokenConfig, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from('protocol_token_config')],
  PROGRAM_ID
);

console.log('🔍 Derived ProtocolTokenConfig PDA:');
console.log('  Address:', protocolTokenConfig.toString());
console.log('  Bump:', bump);
console.log('');
console.log('📋 Expected from user:');
console.log('  Address: 3TLoGQXLQyyExNUekdtjinSig9uBnrwLZXHbJ4ECBrq3');
console.log('');

if (protocolTokenConfig.toString() === '3TLoGQXLQyyExNUekdtjinSig9uBnrwLZXHbJ4ECBrq3') {
  console.log('✅ PDA MATCHES! Using correct derivation.');
} else {
  console.log('❌ PDA MISMATCH! Need to check derivation logic.');
  console.log('');
  console.log('This means the ProtocolTokenConfig might use different seeds.');
  console.log('Check the contract code for the actual PDA seeds.');
}

