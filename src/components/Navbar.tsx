import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="relative z-50 bg-dark-900/80 backdrop-blur-lg border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-3">
              <img src="/logo.png" alt="Kedolik" className="w-10 h-10" />
              <span className="text-xl font-bold gradient-text font-heading">
                KEDOLIK SWAP
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-gray-300 hover:text-brand-cyan transition-colors duration-200">
              Home
            </Link>
            <div className="relative group">
              <button className="text-gray-300 hover:text-brand-cyan transition-colors duration-200 flex items-center">
                Swap
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <div className="relative group">
              <button className="text-gray-300 hover:text-brand-cyan transition-colors duration-200 flex items-center">
                Pools
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <button className="text-gray-300 hover:text-brand-cyan transition-colors duration-200">
              More
            </button>
            <Link 
              to="/kedolikfun" 
              className="text-gray-300 hover:text-brand-pink transition-colors duration-200 flex items-center gap-2"
            >
              KedolikFun
              <span className="text-xs text-red-400 font-semibold">Coming Soon</span>
            </Link>
            <Link 
              to="/kedolikpad" 
              className="text-gray-300 hover:text-brand-pink transition-colors duration-200 flex items-center gap-2"
            >
              KedolikPad
              <span className="text-xs text-red-400 font-semibold">Coming Soon</span>
            </Link>
          </div>

          {/* Wallet Button */}
          <div className="hidden md:flex items-center">
            <WalletMultiButton className="!bg-gradient-brand !rounded-full !shadow-glow-brand hover:!brightness-110 !transition-all !duration-300 hover:!scale-105" />
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-300 hover:text-brand-cyan transition-colors"
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
        <div className="md:hidden bg-dark-800/95 backdrop-blur-lg border-t border-white/5">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <Link to="/" className="block px-3 py-2 text-gray-300 hover:text-brand-cyan transition-colors">
              Home
            </Link>
            <Link to="/swap" className="block px-3 py-2 text-gray-300 hover:text-brand-cyan transition-colors">
              Swap
            </Link>
            <Link to="/pools" className="block px-3 py-2 text-gray-300 hover:text-brand-cyan transition-colors">
              Pools
            </Link>
            <div className="px-3 py-2">
              <WalletMultiButton className="!w-full !bg-gradient-brand !rounded-full" />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

