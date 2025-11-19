import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Fetch deployment info after new contract deployment
 * Usage: npx ts-node scripts/get-deployment-info.ts <PROGRAM_ID>
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('❌ Usage: npx ts-node scripts/get-deployment-info.ts <PROGRAM_ID>');
    console.error('Example: npx ts-node scripts/get-deployment-info.ts 2LVtzKZ7DwoowxeKnwmia6JGKdZy9cjAzH62RrburWtq');
    process.exit(1);
  }
  
  const programId = new PublicKey(args[0]);
  const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT;
  
  if (!RPC_ENDPOINT) {
    console.error('❌ ERROR: VITE_RPC_ENDPOINT is not set in environment!');
    console.error('💡 Please set it in your .env file or export it:');
    console.error('   export VITE_RPC_ENDPOINT=https://your-quicknode-endpoint.solana-mainnet.quiknode.pro/your-key/');
    process.exit(1);
  }
  
  console.log('🔍 Fetching deployment info...\n');
  console.log('📋 Program ID:', programId.toString());
  console.log('🌐 RPC:', RPC_ENDPOINT.replace(/\/\/[^/]+@/, '//***@').replace(/\/[^/]+\/[^/]+\//, '/***/***/'), '\n');
  
  try {
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    
    // Load IDL
    const idlPath = path.join(__dirname, '../kedolik_cp_swap.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    
    // Create dummy wallet (read-only)
    const provider = new AnchorProvider(
      connection,
      {} as Wallet,
      { commitment: 'confirmed' }
    );
    
    const program = new Program(idl, programId, provider);
    
    // Find all AMM configs for this program
    console.log('📊 Searching for AMM Configs...');
    const configs = await connection.getProgramAccounts(programId, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: 'GrSb4L', // Discriminator for AmmConfig account (first 8 bytes base58)
          },
        },
      ],
    });
    
    console.log(`Found ${configs.length} AMM Config(s)\n`);
    
    for (let i = 0; i < configs.length; i++) {
      const configPubkey = configs[i].pubkey;
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📋 AMM Config #${i + 1}: ${configPubkey.toString()}`);
      console.log('='.repeat(70));
      
      try {
        const configData = await (program.account as any).ammConfig.fetch(configPubkey);
        
        console.log('\n🔧 Config Details:');
        console.log(`  Protocol Owner (Admin): ${configData.protocolOwner?.toString() || configData.protocol_owner?.toString() || 'N/A'}`);
        console.log(`  Fee Receiver: ${configData.feeReceiver?.toString() || configData.fundOwner?.toString() || 'N/A'}`);
        console.log(`  Create Pool Fee: ${configData.createPoolFee?.toString() || 'N/A'} lamports`);
        console.log(`  Trade Fee Rate: ${configData.tradeFeeRate?.toString() || 'N/A'} bps`);
        console.log(`  Protocol Fee Rate: ${configData.protocolFeeRate?.toString() || 'N/A'} bps`);
        
        // Get fee receiver's KEDOLOG treasury
        const feeReceiver = configData.feeReceiver || configData.fundOwner;
        if (feeReceiver) {
          const kedologMint = new PublicKey('22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx');
          const treasuryAccount = await getAssociatedTokenAddress(
            kedologMint,
            feeReceiver
          );
          
          console.log(`\n💰 Fee Receiver's KEDOLOG Treasury:`);
          console.log(`  ${treasuryAccount.toString()}`);
          
          // Check if it exists
          const treasuryInfo = await connection.getAccountInfo(treasuryAccount);
          if (treasuryInfo) {
            console.log(`  ✅ Treasury account exists`);
          } else {
            console.log(`  ⚠️  Treasury account does NOT exist yet (will be created on first swap)`);
          }
        }
      } catch (error: any) {
        console.error(`  ❌ Error fetching config data:`, error.message);
      }
    }
    
    // Find Protocol Token Config
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('📋 Protocol Token Config');
    console.log('='.repeat(70));
    
    try {
      const [protocolTokenConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('protocol_token_config')],
        programId
      );
      
      console.log(`Address: ${protocolTokenConfig.toString()}`);
      
      const ptcData = await (program.account as any).protocolTokenConfig.fetch(protocolTokenConfig);
      
      console.log('\n🔧 Config Details:');
      console.log(`  Authority: ${ptcData.authority?.toString() || 'N/A'}`);
      console.log(`  Protocol Token Mint: ${ptcData.protocolTokenMint?.toString() || 'N/A'}`);
      console.log(`  Treasury: ${ptcData.treasury?.toString() || 'N/A'}`);
      console.log(`  Discount Rate: ${ptcData.discountRate?.toString() || 'N/A'} bps (${(ptcData.discountRate?.toNumber() || 0) / 100}%)`);
      console.log(`  Price Pool: ${ptcData.pricePool?.toString() || 'Not set'}`);
    } catch (error: any) {
      console.error('❌ Protocol Token Config not found or error:', error.message);
    }
    
    // Find all pools
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('🏊 Pools');
    console.log('='.repeat(70));
    
    try {
      const pools = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: 'CrxJ9P', // Discriminator for PoolState account
            },
          },
        ],
      });
      
      console.log(`Found ${pools.length} pool(s)\n`);
      
      for (let i = 0; i < pools.length; i++) {
        const poolPubkey = pools[i].pubkey;
        console.log(`\n📍 Pool #${i + 1}: ${poolPubkey.toString()}`);
        
        try {
          const poolData = await (program.account as any).poolState.fetch(poolPubkey);
          
          console.log(`  Token 0 Mint: ${poolData.token0Mint?.toString() || poolData.mint0?.toString()}`);
          console.log(`  Token 1 Mint: ${poolData.token1Mint?.toString() || poolData.mint1?.toString()}`);
          console.log(`  Token 0 Vault: ${poolData.token0Vault?.toString()}`);
          console.log(`  Token 1 Vault: ${poolData.token1Vault?.toString()}`);
          console.log(`  LP Mint: ${poolData.lpMint?.toString()}`);
        } catch (error: any) {
          console.error(`  ❌ Error fetching pool data:`, error.message);
        }
      }
    } catch (error: any) {
      console.error('❌ Error fetching pools:', error.message);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Deployment info fetched successfully!');
    console.log('='.repeat(70) + '\n');
    
    console.log('📝 Next steps:');
    console.log('1. Update src/config/addresses.ts with the addresses above');
    console.log('2. Copy the new IDL to kedolik_cp_swap.json');
    console.log('3. Run: npm run build');
    console.log('4. Hard refresh browser (Ctrl+Shift+R)');
    console.log('5. Test swaps!\n');
    
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.logs) {
      console.error('Logs:', error.logs);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

