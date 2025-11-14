import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { TokenInfo } from '../config/tokens';

interface TokenImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (token: TokenInfo) => void;
  connection: any;
  existingTokens: TokenInfo[];
}

export const TokenImportModal = ({
  isOpen,
  onClose,
  onImport,
  connection,
  existingTokens,
}: TokenImportModalProps) => {
  const [importMint, setImportMint] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [tokenPreview, setTokenPreview] = useState<{
    symbol: string;
    name: string;
    decimals: number;
    mint: PublicKey;
  } | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualSymbol, setManualSymbol] = useState('');

  // Fetch token metadata directly from blockchain
  const fetchTokenMetadata = async (
    mintAddress: string
  ): Promise<{ symbol: string; name: string; decimals: number } | null> => {
    try {
      const mintPubkey = new PublicKey(mintAddress);
      const mintInfo = await getMint(connection, mintPubkey);
      const decimals = mintInfo.decimals;

      let symbol = '';
      let name = '';

      // Try Metaplex Token Metadata
      try {
        const metadataProgramId = new PublicKey(
          'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
        );
        const [metadataPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from('metadata'),
            metadataProgramId.toBuffer(),
            mintPubkey.toBuffer(),
          ],
          metadataProgramId
        );

        const metadataAccount = await connection.getAccountInfo(metadataPDA);

        if (metadataAccount && metadataAccount.data.length > 0) {
          const data = Buffer.from(metadataAccount.data);
          const key = data[0];

          if (key === 4) {
            let offset = 1 + 32 + 32;

            if (offset + 4 <= data.length) {
              const nameLen = data.readUInt32LE(offset);
              offset += 4;
              if (
                nameLen > 0 &&
                nameLen < 1000 &&
                offset + nameLen <= data.length
              ) {
                name = data
                  .slice(offset, offset + nameLen)
                  .toString('utf8')
                  .replace(/\0/g, '')
                  .trim();
                offset += nameLen;
              }
            }

            if (offset + 4 <= data.length) {
              const symbolLen = data.readUInt32LE(offset);
              offset += 4;
              if (
                symbolLen > 0 &&
                symbolLen < 100 &&
                offset + symbolLen <= data.length
              ) {
                symbol = data
                  .slice(offset, offset + symbolLen)
                  .toString('utf8')
                  .replace(/\0/g, '')
                  .trim();
              }
            }

            if (symbol && name) {
              return { symbol, name, decimals };
            }
          }
        }
      } catch (e) {
        // Metadata not found
      }

      // Try SPL Token Metadata Extension
      try {
        const mintAccountInfo = await connection.getParsedAccountInfo(mintPubkey);
        const parsedData = mintAccountInfo.value?.data;

        if (parsedData && 'parsed' in parsedData) {
          const mintData = parsedData.parsed.info;
          if (mintData.extensions && Array.isArray(mintData.extensions)) {
            for (const ext of mintData.extensions) {
              if (ext.extension === 'tokenMetadata' && ext.state) {
                if (ext.state.name) name = ext.state.name;
                if (ext.state.symbol) symbol = ext.state.symbol;
                if (name && symbol) {
                  return { symbol, name, decimals };
                }
              }
            }
          }
        }
      } catch (e) {
        // Extension not found
      }

      // Fallback to shortened address
      const addressShort =
        mintAddress.substring(0, 6) +
        '...' +
        mintAddress.substring(mintAddress.length - 4);
      symbol = addressShort.toUpperCase();
      name = `Token (${addressShort})`;

      return { symbol, name, decimals };
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      return null;
    }
  };

  const handleVerify = async () => {
    setImportError('');
    setTokenPreview(null);
    setShowManualEntry(false);
    setManualName('');
    setManualSymbol('');

    if (!importMint || !importMint.trim()) {
      setImportError('Please enter a token mint address');
      return;
    }

    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(importMint.trim());
    } catch (error) {
      setImportError('Invalid mint address format');
      return;
    }

    if (existingTokens.some((t) => t.mint.equals(mintPubkey))) {
      setImportError('Token already exists in the list');
      return;
    }

    setIsVerifying(true);

    try {
      await getMint(connection, mintPubkey); // Verify token exists
      console.log('✅ Token verified:', mintPubkey.toString());

      const metadata = await fetchTokenMetadata(importMint.trim());

      if (!metadata) {
        setImportError('Failed to fetch token metadata');
        setIsVerifying(false);
        return;
      }

      const isFallback =
        metadata.symbol.includes('...') || metadata.name.includes('...');

      setTokenPreview({
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        mint: mintPubkey,
      });

      if (isFallback) {
        setShowManualEntry(true);
      }
    } catch (error: any) {
      if (error.message?.includes('could not find account')) {
        setImportError('Token not found on blockchain. Please verify the address.');
      } else {
        setImportError(error.message || 'Failed to verify token');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleImport = () => {
    if (!tokenPreview) {
      setImportError('Please verify the token first');
      return;
    }

    const finalSymbol =
      showManualEntry && manualSymbol.trim()
        ? manualSymbol.trim()
        : tokenPreview.symbol;
    const finalName =
      showManualEntry && manualName.trim() ? manualName.trim() : tokenPreview.name;

    if (showManualEntry && (!finalSymbol || !finalName)) {
      setImportError('Please enter both token name and symbol');
      return;
    }

    setIsImporting(true);

    const newToken: TokenInfo = {
      mint: tokenPreview.mint,
      symbol: finalSymbol,
      name: finalName,
      decimals: tokenPreview.decimals,
    };

    onImport(newToken);
    handleClose();
  };

  const handleClose = () => {
    setImportMint('');
    setTokenPreview(null);
    setImportError('');
    setShowManualEntry(false);
    setManualName('');
    setManualSymbol('');
    setIsVerifying(false);
    setIsImporting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-900 rounded-2xl border border-white/20 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar animate-scale-in">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-dark-900 flex items-center justify-between p-4 sm:p-6 border-b border-white/10">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">Import Token</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">
              Add a custom token by mint address
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
          >
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Mint Input */}
          <div>
            <label className="block text-xs sm:text-sm text-gray-300 mb-2 font-medium">
              Token Mint Address *
            </label>
            <input
              type="text"
              value={importMint}
              onChange={(e) => {
                setImportMint(e.target.value);
                setTokenPreview(null);
                setImportError('');
                setShowManualEntry(false);
              }}
              placeholder="Enter SPL token mint address"
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-dark-800 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-cyan/50 transition-colors"
              disabled={isImporting || isVerifying}
            />
            <p className="text-xs text-gray-500 mt-1.5">
              Paste the token's mint address from Solana Explorer
            </p>
          </div>

          {/* Verify Button */}
          <button
            onClick={handleVerify}
            disabled={!importMint.trim() || isVerifying || isImporting}
            className="w-full px-4 py-2.5 sm:py-3 bg-brand-cyan hover:bg-brand-cyan/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm sm:text-base font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Verify Token</span>
              </>
            )}
          </button>

          {/* Token Preview */}
          {tokenPreview && (
            <div className="bg-dark-800/50 border border-brand-cyan/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Token Details</h3>
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-brand rounded-full flex items-center justify-center text-base font-bold flex-shrink-0">
                  {(showManualEntry && manualSymbol
                    ? manualSymbol
                    : tokenPreview.symbol
                  )[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base sm:text-lg font-bold text-white">
                    {showManualEntry && manualSymbol
                      ? manualSymbol
                      : tokenPreview.symbol}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {showManualEntry && manualName ? manualName : tokenPreview.name}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Decimals</div>
                  <div className="text-sm font-semibold text-white">
                    {tokenPreview.decimals}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Mint Address</div>
                  <div className="text-xs font-mono text-gray-300 break-all">
                    {tokenPreview.mint.toString().substring(0, 6)}...
                    {tokenPreview.mint
                      .toString()
                      .substring(tokenPreview.mint.toString().length - 6)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manual Entry */}
          {showManualEntry && tokenPreview && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-yellow-400 mb-1">
                    No On-Chain Metadata
                  </h3>
                  <p className="text-xs text-yellow-300/80">
                    This token doesn't have metadata on the blockchain. Please enter
                    the name and symbol manually.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs text-gray-300 mb-2">
                    Symbol *
                  </label>
                  <input
                    type="text"
                    value={manualSymbol}
                    onChange={(e) => setManualSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g., BTC, ETH, USDC"
                    maxLength={10}
                    className="w-full px-3 py-2 bg-dark-900 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-300 mb-2">Name *</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g., Bitcoin, Ethereum"
                    maxLength={50}
                    className="w-full px-3 py-2 bg-dark-900 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {importError && (
            <div className="text-xs sm:text-sm text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-400/20">
              {importError}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
            <button
              onClick={handleClose}
              disabled={isImporting || isVerifying}
              className="flex-1 px-4 py-2.5 sm:py-3 bg-dark-800 hover:bg-dark-700 disabled:opacity-50 rounded-lg text-gray-300 text-sm sm:text-base font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!tokenPreview || isImporting}
              className="flex-1 px-4 py-2.5 sm:py-3 bg-gradient-brand hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm sm:text-base font-semibold transition-all shadow-glow-brand"
            >
              {isImporting ? 'Importing...' : 'Import Token'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

