import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useConfig } from '../contexts/ConfigContext';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { adminAddress } = useConfig();
  const { kedolikDevnetEnabled } = useFeatureFlags();
  const [feeReceiverAddress, setFeeReceiverAddress] = useState<string | null>(null);

  const isActive = (path: string) => location.pathname === path;
  const isAdmin = publicKey && adminAddress ? publicKey.toString() === adminAddress : false;
  const isFeeReceiver = publicKey && feeReceiverAddress ? publicKey.toString() === feeReceiverAddress : false;
  const canAccessAdmin = isAdmin || isFeeReceiver;
  const isMoreActive = [
    '/kedolik-locker',
    '/kedolik-staking',
    '/kedolikfun',
    '/kedolikpad',
  ].includes(location.pathname);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMoreOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMoreOpen]);

  // Fetch fee receiver address when wallet connects
  useEffect(() => {
    const fetchFeeReceiver = async () => {
      if (!connected || !wallet) {
        setFeeReceiverAddress(null);
        return;
      }

      try {
        const { getProgram, AMM_CONFIG } = await import('../utils/amm');
        const program = getProgram(connection, wallet);
        
        type AmmCfg = { feeReceiver?: { toString(): string }; fundOwner?: { toString(): string } };
        type AmmProgramAcc = { ammConfig: { fetch: (p: unknown) => Promise<AmmCfg> } };
        const ammConfigData = await (program.account as unknown as AmmProgramAcc).ammConfig.fetch(AMM_CONFIG);
        
        const feeReceiver = ammConfigData.feeReceiver || ammConfigData.fundOwner;
        if (feeReceiver) {
          setFeeReceiverAddress(feeReceiver.toString());
        }
      } catch (error) {
        console.error('Error fetching fee receiver:', error);
      }
    };

    fetchFeeReceiver();
  }, [connected, wallet, connection]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[60] bg-dark-900/70 backdrop-blur-xl border-b border-white/10">
      {/* Gradient line at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-brand"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2 sm:space-x-3 group">
              <div className="relative">
                <img 
                  src="/logo.png" 
                  alt="Kedolik" 
                  className="w-10 h-10 rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" 
                />
                <div className="absolute inset-0 bg-gradient-brand rounded-full blur-lg opacity-0 group-hover:opacity-50 transition-opacity duration-300"></div>
              </div>
              <span className="text-base sm:text-xl font-bold gradient-text font-heading tracking-wide whitespace-nowrap">
                Kedolik Swap
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-1">
            <Link 
              to="/" 
              className={`relative px-4 py-2 rounded-lg font-medium transition-all duration-300 group ${
                isActive('/') 
                  ? 'text-white' 
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Home
              {isActive('/') && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-brand"></div>
              )}
              {!isActive('/') && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-brand scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
              )}
            </Link>

            <Link 
              to="/swap"
              className="relative px-4 py-2 rounded-lg font-medium text-gray-300 hover:text-white transition-all duration-300 group"
            >
              Swap
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-brand scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
            </Link>

            <Link 
              to="/pools"
              className="relative px-4 py-2 rounded-lg font-medium text-gray-300 hover:text-white transition-all duration-300 group"
            >
              Pools
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-brand scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
            </Link>

            {canAccessAdmin && (
              <Link 
                to="/admin"
                className={`relative px-4 py-2 rounded-lg font-medium transition-all duration-300 group ${
                  isActive('/admin') 
                    ? 'text-white bg-gradient-brand' 
                    : 'text-yellow-400 hover:text-yellow-300 border border-yellow-400/20 hover:border-yellow-400/40'
                }`}
              >
                {isAdmin ? '👑 Admin' : '💰 Fees'}
                {isActive('/admin') && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400"></div>
                )}
              </Link>
            )}

            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setIsMoreOpen((current) => !current)}
                aria-expanded={isMoreOpen}
                className={`relative px-4 py-2 rounded-lg font-medium transition-all duration-300 group ${
                  isMoreActive
                    ? 'text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                More
                <svg className={`w-4 h-4 ml-1 inline-block transition-transform duration-300 ${isMoreOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {isMoreActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-brand"></div>
                )}
              </button>

              {isMoreOpen && (
                <div className="absolute right-0 top-full mt-3 w-72 rounded-3xl border border-white/10 bg-dark-900/95 p-3 shadow-2xl backdrop-blur-xl">
                  <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Earn
                  </div>

                  {kedolikDevnetEnabled && (
                    <>
                      <Link
                        to="/kedolik-locker"
                        className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm text-gray-200 transition-all duration-300 hover:bg-white/5 hover:text-white"
                      >
                        <span>Kedolik Locker</span>
                        <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-bold text-brand-cyan">
                          DEVNET
                        </span>
                      </Link>
                      <Link
                        to="/kedolik-staking"
                        className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm text-gray-200 transition-all duration-300 hover:bg-white/5 hover:text-white"
                      >
                        <span>Kedolik Staking</span>
                        <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-bold text-brand-cyan">
                          DEVNET
                        </span>
                      </Link>
                    </>
                  )}

                  <div className="mt-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Launch
                  </div>
                  <Link
                    to="/kedolikfun"
                    className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm text-gray-200 transition-all duration-300 hover:bg-white/5 hover:text-white"
                  >
                    <span>KedolikFun</span>
                    <span className="rounded-full border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                      PREVIEW
                    </span>
                  </Link>
                  <Link
                    to="/kedolikpad"
                    className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm text-gray-200 transition-all duration-300 hover:bg-white/5 hover:text-white"
                  >
                    <span>KedolikPad</span>
                    <span className="rounded-full border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                      PREVIEW
                    </span>
                  </Link>
                </div>
              )}
            </div>

            <div className="w-px h-6 bg-white/10 mx-2"></div>
          </div>

          {/* Wallet Button & Profile */}
          <div className="hidden lg:flex items-center gap-3 z-[70]">
            {location.pathname !== '/profile' && (
              <Link 
                to="/profile" 
                className="p-2 hover:bg-white/10 rounded-full transition-all duration-300 group"
                title="View Profile"
              >
                <svg className="w-6 h-6 text-gray-300 group-hover:text-brand-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </Link>
            )}
            <WalletMultiButton className="!bg-gradient-brand !rounded-full !shadow-glow-brand hover:!brightness-110 !transition-all !duration-300 hover:!scale-105 !font-semibold !px-6" />
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden flex items-center gap-2 z-[70]">
            <WalletMultiButton className="!bg-gradient-brand !rounded-full !text-[10px] sm:!text-xs !px-2 sm:!px-3 !py-1.5 sm:!py-2 !z-[75] !max-w-[100px] !overflow-hidden" style={{ 
              '--wallet-button-text': 'Connect' 
            } as React.CSSProperties} />
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all duration-300"
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="lg:hidden bg-dark-800/95 backdrop-blur-xl border-t border-white/10 animate-in slide-in-from-top duration-300">
          <div className="px-4 pt-4 pb-6 space-y-2">
            <Link 
              to="/" 
              className={`block px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                isActive('/') 
                  ? 'bg-gradient-brand text-white shadow-glow-brand' 
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
              onClick={() => setIsOpen(false)}
            >
              Home
            </Link>
            <Link 
              to="/swap" 
              className="block px-4 py-3 rounded-xl font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-300"
              onClick={() => setIsOpen(false)}
            >
              Swap
            </Link>
            <Link 
              to="/pools" 
              className="block px-4 py-3 rounded-xl font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-300"
              onClick={() => setIsOpen(false)}
            >
              Pools
            </Link>
            {kedolikDevnetEnabled && (
              <>
                <Link
                  to="/kedolik-locker"
                  className={`block px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                    isActive('/kedolik-locker')
                      ? 'bg-gradient-brand text-white shadow-glow-brand'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  Kedolik Locker
                </Link>
                <Link
                  to="/kedolik-staking"
                  className={`block px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                    isActive('/kedolik-staking')
                      ? 'bg-gradient-brand text-white shadow-glow-brand'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  Kedolik Staking
                </Link>
              </>
            )}
            <Link 
              to="/profile" 
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-300"
              onClick={() => setIsOpen(false)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </Link>
            
            {canAccessAdmin && (
              <Link 
                to="/admin"
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                  isActive('/admin') 
                    ? 'bg-gradient-brand text-white shadow-glow-brand' 
                    : 'text-yellow-400 hover:bg-yellow-400/10 border border-yellow-400/20'
                }`}
                onClick={() => setIsOpen(false)}
              >
                <span className="text-xl">{isAdmin ? '👑' : '💰'}</span>
                {isAdmin ? 'Admin Panel' : 'Fee Management'}
              </Link>
            )}
            
            <div className="h-px bg-white/10 my-4"></div>

            <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Launch
            </div>
            
            <Link 
              to="/kedolikfun" 
              className="flex items-center justify-between px-4 py-3 rounded-xl font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-300"
              onClick={() => setIsOpen(false)}
            >
              <span>KedolikFun</span>
              <span className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded-full border border-red-500/30 font-bold">
                SOON
              </span>
            </Link>
            <Link 
              to="/kedolikpad" 
              className="flex items-center justify-between px-4 py-3 rounded-xl font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-300"
              onClick={() => setIsOpen(false)}
            >
              <span>KedolikPad</span>
              <span className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded-full border border-red-500/30 font-bold">
                SOON
              </span>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

