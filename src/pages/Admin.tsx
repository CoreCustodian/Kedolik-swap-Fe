import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { toast } from 'react-hot-toast';
import idlData from '../../kedolik_cp_swap.json';
import { FEE_TIER_CONFIGS, getAmmConfigAddress } from '../config/fees';

const PROGRAM_ID = new PublicKey(idlData.address);
// Note: Admin check removed - the smart contract itself enforces permissions

interface ConfigStatus {
  index: number;
  feeBps: number;
  label: string;
  address: string;
  exists: boolean;
  checking: boolean;
  creating: boolean;
}

export default function Admin() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [configs, setConfigs] = useState<ConfigStatus[]>([]);
  const [checking, setChecking] = useState(false);

  // Admin check removed - contract enforces permissions

  const checkAllConfigs = async () => {
    if (!wallet.publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    setChecking(true);
    const statusList: ConfigStatus[] = [];

    try {
      for (const config of FEE_TIER_CONFIGS) {
        const address = getAmmConfigAddress(PROGRAM_ID, config.index);
        
        setConfigs(prev => [
          ...prev.filter(c => c.index !== config.index),
          {
            index: config.index,
            feeBps: config.feeBps,
            label: config.label,
            address: address.toString(),
            exists: false,
            checking: true,
            creating: false,
          }
        ]);

        try {
          const accountInfo = await connection.getAccountInfo(address);
          const exists = accountInfo !== null;
          
          statusList.push({
            index: config.index,
            feeBps: config.feeBps,
            label: config.label,
            address: address.toString(),
            exists,
            checking: false,
            creating: false,
          });
        } catch (error) {
          statusList.push({
            index: config.index,
            feeBps: config.feeBps,
            label: config.label,
            address: address.toString(),
            exists: false,
            checking: false,
            creating: false,
          });
        }
      }

      setConfigs(statusList);
      
      const existingCount = statusList.filter(c => c.exists).length;
      const missingCount = statusList.filter(c => !c.exists).length;
      
      toast.success(`Found ${existingCount} existing, ${missingCount} missing configs`);
    } catch (error: any) {
      console.error('Error checking configs:', error);
      toast.error(`Failed to check configs: ${error.message}`);
    } finally {
      setChecking(false);
    }
  };

  const createConfig = async (index: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error('Wallet not connected');
      return;
    }

    // Contract will enforce permissions
    
    const config = FEE_TIER_CONFIGS.find(c => c.index === index);
    if (!config) {
      toast.error('Config not found');
      return;
    }

    // Update status to "creating"
    setConfigs(prev =>
      prev.map(c =>
        c.index === index ? { ...c, creating: true } : c
      )
    );

    try {
      const provider = new AnchorProvider(
        connection,
        wallet as any,
        { commitment: 'confirmed' }
      );

      const program = new Program(idlData as any, provider);
      
      // Let Anchor derive the PDA automatically - just for logging
      console.log(`Creating AMM Config ${index} (${config.label})...`);
      console.log(`Program ID: ${PROGRAM_ID.toString()}`);

      // Fee structure:
      // - Trade fee: from config (e.g., 100 bps = 1%)
      // - Protocol fee: 20% of trade fee (2000 bps = 20%)
      // - Fund fee: 10% of trade fee (1000 bps = 10%)
      // - Creator fee: 5% of trade fee (500 bps = 5%)
      // - Pool creation fee: 0.01 SOL

      const tx = await program.methods
        .createAmmConfig(
          index,
          new BN(config.feeBps),     // Trade fee rate
          new BN(2000),              // Protocol fee rate (20%)
          new BN(1000),              // Fund fee rate (10%)
          new BN(10_000_000),        // Create pool fee (0.01 SOL)
          new BN(500)                // Creator fee rate (5%)
        )
        .accounts({
          owner: wallet.publicKey,
          // ammConfig is derived automatically by Anchor from the index argument
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Config ${index} created! TX:`, tx);
      toast.success(
        <div>
          <div>Config {config.label} created!</div>
          <a
            href={`https://explorer.solana.com/tx/${tx}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline text-sm"
          >
            View on Explorer
          </a>
        </div>,
        { duration: 5000 }
      );

      // Wait and recheck
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update status
      setConfigs(prev =>
        prev.map(c =>
          c.index === index
            ? { ...c, exists: true, creating: false }
            : c
        )
      );
    } catch (error: any) {
      console.error('Error creating config:', error);
      toast.error(`Failed to create config: ${error.message}`);
      
      // Reset creating status
      setConfigs(prev =>
        prev.map(c =>
          c.index === index ? { ...c, creating: false } : c
        )
      );
    }
  };

  const createAllMissing = async () => {
    // Contract will enforce permissions
    
    const missing = configs.filter(c => !c.exists);
    if (missing.length === 0) {
      toast.success('All configs already exist!');
      return;
    }

    toast.loading(`Creating ${missing.length} configs...`);

    for (const config of missing) {
      await createConfig(config.index);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between transactions
    }

    toast.dismiss();
    toast.success('All missing configs created!');
    await checkAllConfigs();
  };

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="card mb-6">
          <h1 className="text-3xl font-bold gradient-text mb-2">Admin Panel</h1>
          <p className="text-gray-400">Manage AMM fee tier configurations</p>
        </div>

        {!wallet.connected && (
          <div className="card bg-yellow-500/10 border-yellow-500/20">
            <p className="text-yellow-400">
              ⚠️ Please connect your wallet to use the admin panel
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Note: Only the contract owner can create AMM configs
            </p>
          </div>
        )}

        {wallet.connected && (
          <>
            <div className="card mb-6">
              <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
              <div className="flex gap-4">
                <button
                  onClick={checkAllConfigs}
                  disabled={checking}
                  className="btn-secondary"
                >
                  {checking ? '🔍 Checking...' : '🔍 Check All Configs'}
                </button>
                
                {configs.length > 0 && configs.some(c => !c.exists) && (
                  <button
                    onClick={createAllMissing}
                    className="btn-primary"
                  >
                    ✨ Create All Missing
                  </button>
                )}
              </div>
            </div>

            {configs.length > 0 && (
              <div className="card">
                <h2 className="text-xl font-bold mb-4">Fee Tier Configurations</h2>
                <div className="space-y-4">
                  {configs.map(config => (
                    <div
                      key={config.index}
                      className="bg-white/5 p-4 rounded-lg border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl font-bold text-purple-400">
                            {config.label}
                          </div>
                          {config.exists ? (
                            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm">
                              ✅ Initialized
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-sm">
                              ❌ Not Initialized
                            </span>
                          )}
                        </div>
                        
                        {!config.exists && (
                          <button
                            onClick={() => createConfig(config.index)}
                            disabled={config.creating}
                            className="btn-primary text-sm"
                          >
                            {config.creating ? '⏳ Creating...' : '✨ Create'}
                          </button>
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-400 space-y-1">
                        <div>Index: {config.index}</div>
                        <div>Fee: {config.feeBps} basis points ({config.label})</div>
                        <div className="font-mono text-xs break-all">
                          Address: {config.address}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {configs.length === 0 && (
              <div className="card text-center text-gray-400">
                <p>Click "Check All Configs" to view status</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

