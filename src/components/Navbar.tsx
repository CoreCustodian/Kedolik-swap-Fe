import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-900/70 backdrop-blur-xl border-b border-white/10">
      {/* Gradient line at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-brand"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="relative">
                <img 
                  src="/logo.png" 
                  alt="Kedolik" 
                  className="w-10 h-10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" 
                />
                <div className="absolute inset-0 bg-gradient-brand rounded-full blur-lg opacity-0 group-hover:opacity-50 transition-opacity duration-300"></div>
              </div>
              <span className="text-xl font-bold gradient-text font-heading tracking-wide">
                KEDOLIK SWAP
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

            <button className="relative px-4 py-2 rounded-lg font-medium text-gray-300 hover:text-white transition-all duration-300 group">
              More
              <svg className="w-4 h-4 ml-1 inline-block group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div className="w-px h-6 bg-white/10 mx-2"></div>

            <Link 
              to="/kedolikfun" 
              className="relative px-4 py-2 rounded-lg font-medium text-gray-300 hover:text-white transition-all duration-300 group flex items-center gap-2"
            >
              KedolikFun
              <span className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded-full border border-red-500/30 font-bold animate-pulse">
                SOON
              </span>
            </Link>

            <Link 
              to="/kedolikpad" 
              className="relative px-4 py-2 rounded-lg font-medium text-gray-300 hover:text-white transition-all duration-300 group flex items-center gap-2"
            >
              KedolikPad
              <span className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded-full border border-red-500/30 font-bold animate-pulse">
                SOON
              </span>
            </Link>
          </div>

          {/* Wallet Button */}
          <div className="hidden lg:flex items-center">
            <WalletMultiButton className="!bg-gradient-brand !rounded-full !shadow-glow-brand hover:!brightness-110 !transition-all !duration-300 hover:!scale-105 !font-semibold !px-6" />
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden flex items-center gap-3">
            <WalletMultiButton className="!bg-gradient-brand !rounded-full !text-xs !px-4 !py-2" />
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all duration-300"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            
            <div className="h-px bg-white/10 my-4"></div>
            
            <Link 
              to="/kedolikfun" 
              className="block px-4 py-3 rounded-xl font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-300 flex items-center justify-between"
              onClick={() => setIsOpen(false)}
            >
              <span>KedolikFun</span>
              <span className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded-full border border-red-500/30 font-bold">
                SOON
              </span>
            </Link>
            <Link 
              to="/kedolikpad" 
              className="block px-4 py-3 rounded-xl font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-300 flex items-center justify-between"
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

