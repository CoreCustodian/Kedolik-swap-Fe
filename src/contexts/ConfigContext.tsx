import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

interface ConfigContextType {
  adminAddress: string | null;
  discountRate: number | null;
  isLoading: boolean;
  refreshConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType>({
  adminAddress: null,
  discountRate: null,
  isLoading: true,
  refreshConfig: async () => {},
});

export const useConfig = () => useContext(ConfigContext);

interface ConfigProviderProps {
  children: ReactNode;
}

export const ConfigProvider = ({ children }: ConfigProviderProps) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [adminAddress, setAdminAddress] = useState<string | null>(null);
  const [discountRate, setDiscountRate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { getProgram, AMM_CONFIG } = await import('../utils/amm');
      const { getProtocolTokenConfigAddress } = await import('../config/fees');
      const { PROGRAM_ID } = await import('../utils/amm');
      
      const program = getProgram(connection, wallet);

      // Fetch admin from AMM config
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ammConfigData = await (program.account as any).ammConfig.fetch(AMM_CONFIG);
        
        // Try different field names for admin (protocolOwner is the canonical field)
        let admin: string | null = null;
        if (ammConfigData.protocolOwner) {
          admin = ammConfigData.protocolOwner.toString();
        } else if (ammConfigData.protocol_owner) {
          admin = ammConfigData.protocol_owner.toString();
        } else if (ammConfigData.owner) {
          admin = ammConfigData.owner.toString();
        } else if (ammConfigData.authority) {
          admin = ammConfigData.authority.toString();
        } else if (ammConfigData.admin) {
          admin = ammConfigData.admin.toString();
        }
        
        if (admin) {
          setAdminAddress(admin);
          console.log('✅ Fetched admin from blockchain:', admin);
        } else {
          console.warn('⚠️ Could not find admin field in AMM config. Available fields:', Object.keys(ammConfigData));
        }
      } catch (error) {
        console.error('Error fetching admin:', error);
      }

      // Fetch discount rate from protocol token config
      try {
        const protocolTokenConfigPda = getProtocolTokenConfigAddress(PROGRAM_ID);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const protocolConfigData = await (program.account as any).protocolTokenConfig.fetch(protocolTokenConfigPda);
        
        if (protocolConfigData && protocolConfigData.discountRate !== undefined) {
          // Convert BN to number properly
          const discountRateValue = typeof protocolConfigData.discountRate === 'object' && 'toNumber' in protocolConfigData.discountRate
            ? protocolConfigData.discountRate.toNumber()
            : Number(protocolConfigData.discountRate);
          
          setDiscountRate(discountRateValue);
          console.log('✅ Fetched discount rate from blockchain:', discountRateValue, 'bps');
        }
      } catch (error) {
        console.error('Error fetching discount rate:', error);
        // Use default if not found
        setDiscountRate(2500); // Default 25%
      }

    } catch (error) {
      console.error('Error fetching config from blockchain:', error);
    } finally {
      setIsLoading(false);
    }
  }, [connection, wallet]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const refreshConfig = async () => {
    await fetchConfig();
  };

  return (
    <ConfigContext.Provider value={{ adminAddress, discountRate, isLoading, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};

