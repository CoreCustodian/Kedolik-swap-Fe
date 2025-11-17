import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { TokenInfo, getTokenList } from '../config/tokens';
import { TokenImportModal } from './TokenImportModal';

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  excludeToken?: TokenInfo;
  connection: any;
}

export const TokenSelectModal = ({
  isOpen,
  onClose,
  onSelect,
  excludeToken,
  connection,
}: TokenSelectModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [customTokens, setCustomTokens] = useState<TokenInfo[]>([]);

  // Load custom tokens from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('customTokens');
    if (stored) {
      try {
        const tokens = JSON.parse(stored).map((t: any) => ({
          ...t,
          mint: new PublicKey(t.mint),
        }));
        setCustomTokens(tokens);
      } catch (error) {
        console.error('Error loading custom tokens:', error);
      }
    }
  }, []);

  // Save custom tokens to localStorage
  const saveCustomTokens = (tokens: TokenInfo[]) => {
    localStorage.setItem(
      'customTokens',
      JSON.stringify(
        tokens.map((t) => ({
          ...t,
          mint: t.mint.toString(),
        }))
      )
    );
  };

  // Remove a custom token
  const removeCustomToken = (mintToRemove: PublicKey) => {
    const updatedCustomTokens = customTokens.filter(
      (token) => !token.mint.equals(mintToRemove)
    );
    setCustomTokens(updatedCustomTokens);
    saveCustomTokens(updatedCustomTokens);
  };

  // Handle token import
  const handleTokenImport = (token: TokenInfo) => {
    const updatedCustomTokens = [...customTokens, token];
    setCustomTokens(updatedCustomTokens);
    saveCustomTokens(updatedCustomTokens);
    setShowImportModal(false);
    // Auto-select the imported token
    onSelect(token);
    onClose();
  };

  // Get all available tokens (default + custom)
  const getAllTokens = (): TokenInfo[] => {
    return [...getTokenList(), ...customTokens];
  };

  // Filter tokens based on search
  const filteredTokens = getAllTokens().filter((token) => {
    if (excludeToken && token.mint.equals(excludeToken.mint)) {
      return false;
    }
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      token.symbol.toLowerCase().includes(query) ||
      token.name.toLowerCase().includes(query) ||
      token.mint.toString().toLowerCase().includes(query)
    );
  });

  // Handle token selection
  const handleSelect = (token: TokenInfo) => {
    onSelect(token);
    onClose();
    setSearchQuery('');
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-dark-900 rounded-2xl border border-white/20 shadow-2xl w-full max-w-md max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b border-white/10">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-white">
              Select Token
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1.5 sm:p-2 hover:bg-white/5 rounded-lg"
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

          {/* Search Bar */}
          <div className="p-3 sm:p-4 border-b border-white/10">
            <div className="relative">
              <svg
                className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search name, symbol or paste address"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-dark-800/50 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-cyan/50 transition-colors"
                autoFocus
              />
            </div>
          </div>

          {/* Import Token Button */}
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-white/10">
            <button
              onClick={() => setShowImportModal(true)}
              className="w-full flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 rounded-lg text-brand-cyan text-sm sm:text-base font-medium transition-all"
            >
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Import Custom Token</span>
            </button>
          </div>

          {/* Token List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredTokens.length === 0 ? (
              <div className="px-4 py-12 sm:py-16 text-center text-gray-400">
                <svg
                  className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <p className="text-sm sm:text-base font-medium">No tokens found</p>
                <p className="text-xs sm:text-sm mt-1">
                  Try a different search or import a custom token
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredTokens.map((token) => {
                  const isCustom = customTokens.some((t) => t.mint.equals(token.mint));
                  return (
                    <div
                      key={token.mint.toString()}
                      className="flex items-center gap-2 group hover:bg-white/5 transition-colors"
                    >
                      <button
                        onClick={() => handleSelect(token)}
                        className="flex-1 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left"
                      >
                        {token.logoURI ? (
                          <img 
                            src={token.logoURI} 
                            alt={token.symbol}
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (target.nextElementSibling) {
                                (target.nextElementSibling as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 bg-gradient-brand rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0 ${token.logoURI ? 'hidden' : ''}`}>
                          {token.symbol[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white text-sm sm:text-base">
                              {token.symbol}
                            </span>
                            {isCustom && (
                              <span className="text-xs px-1.5 py-0.5 bg-brand-cyan/20 text-brand-cyan rounded">
                                Custom
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {token.name}
                          </div>
                        </div>
                      </button>
                      {isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              confirm(`Remove ${token.symbol} from your token list?`)
                            ) {
                              removeCustomToken(token.mint);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 mr-2 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 flex-shrink-0"
                          title="Remove token"
                        >
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <TokenImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleTokenImport}
        connection={connection}
        existingTokens={getAllTokens()}
      />
    </>
  );
};
