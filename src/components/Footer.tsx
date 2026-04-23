import { Link } from 'react-router-dom';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

const Footer = () => {
  const { kedolikDevnetEnabled } = useFeatureFlags();

  return (
    <footer className="relative border-t border-white/10 bg-dark-900/80 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Mobile-optimized layout */}
        <div className="block md:hidden space-y-6 mb-6">
          {/* Logo and tagline - centered */}
          <div className="text-center pb-4 border-b border-white/10">
            <div className="flex items-center gap-3 mb-3 justify-center">
              <img src="/logo.png" alt="Kedolik" className="w-10 h-10 rounded-full" />
              <span className="font-bold gradient-text font-heading text-lg">Kedolik Swap</span>
            </div>
            <p className="text-gray-400 text-sm">The Swap Hub for Alpha Hunters</p>
          </div>

          {/* Links in 2 columns for mobile */}
          <div className="grid grid-cols-2 gap-6">
            <div className="text-left">
              <h4 className="font-bold mb-3 font-heading text-sm text-brand-cyan">Swap</h4>
              <ul className="space-y-2 text-gray-400 text-xs">
                <li><Link to="/pools" className="hover:text-brand-cyan transition-colors">Pools</Link></li>
                <li><Link to="/swap" className="hover:text-brand-cyan transition-colors">Farming</Link></li>
                <li><Link to="/swap" className="hover:text-brand-cyan transition-colors">Bridge</Link></li>
              </ul>
            </div>

            <div className="text-left">
              <h4 className="font-bold mb-3 font-heading text-sm text-brand-pink">Earn</h4>
              <ul className="space-y-2 text-gray-400 text-xs">
                {kedolikDevnetEnabled && (
                  <>
                    <li><Link to="/kedolik-locker" className="hover:text-brand-cyan transition-colors">Kedolik Locker</Link></li>
                    <li><Link to="/kedolik-staking" className="hover:text-brand-cyan transition-colors">Kedolik Staking</Link></li>
                  </>
                )}
                <li>
                  <a href="https://kedolik-swap.gitbook.io/kedolik-swap-docs/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-cyan transition-colors">Guide</a>
                </li>
              </ul>
            </div>
          </div>

          {/* Social icons - centered */}
          <div className="text-center pt-2">
            <h4 className="font-bold mb-3 font-heading text-sm">Follow us</h4>
            <div className="flex gap-3 justify-center">
              <a href="https://x.com/kedolik_swap" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M18.9 3H21l-6.6 7.5L22 21h-6.8l-5.3-6.5L3.8 21H2l7.2-8.2L2 3h6.9l4.8 5.9L18.9 3zm-1.2 16h1.8L8.5 5H6.7l11 14z"/>
                </svg>
              </a>
              <a href="https://t.me/Kedolik_Swap" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M9.04 14.62l-.35 4.96c.5 0 .72-.22.98-.49l2.36-2.26 4.89 3.58c.9.5 1.54.24 1.78-.83l3.22-15.1h.01c.28-1.32-.48-1.84-1.35-1.52L1.6 9.45C.32 9.95.34 10.7 1.38 11.03l4.87 1.52 11.3-7.13c.53-.33 1.02-.15.62.19L9.04 14.62z"/>
                </svg>
              </a>
              <a href="https://www.facebook.com/kedolik/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.3.2 2.3.2v2.6h-1.3c-1.3 0-1.7.8-1.7 1.6V12h2.9l-.5 2.9h-2.4v7A10 10 0 0022 12z"/>
                </svg>
              </a>
              <a href="https://www.instagram.com/kedolikswap/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm0 2a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H7zm5 3.5A5.5 5.5 0 1112 18.5 5.5 5.5 0 0112 7.5zm0 2A3.5 3.5 0 1015.5 13 3.5 3.5 0 0012 9.5zm5.75-3a1.25 1.25 0 11-1.25 1.25A1.25 1.25 0 0117.75 6.5z"/>
                </svg>
              </a>
              <a href="https://medium.com/@kedolik" target="_blank" rel="noopener noreferrer" aria-label="Medium" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
                  <path d="M4.8 7.2a1 1 0 00-.32-.84L2.3 4.02v-.3h6.3l4.9 10.76 4.3-10.76h6v.3l-1.7 1.63a.6.6 0 00-.23.58v11.7a.6.6 0 00.23.58l1.66 1.63v.3h-8.5v-.3l1.72-1.68c.17-.17.17-.22.17-.48V8.49l-4.8 12.38h-.65L6.9 8.49v7.86a1.1 1.1 0 00.3.91l2.24 2.73v.3H2v-.3l2.24-2.73c.2-.2.3-.52.25-.8V7.2z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Desktop layout (hidden on mobile) */}
        <div className="hidden md:grid md:grid-cols-4 gap-8 mb-8">
          <div className="text-left">
            <div className="flex items-center gap-3 mb-4">
              <img src="/logo.png" alt="Kedolik" className="w-8 h-8 rounded-full" />
              <span className="font-bold gradient-text font-heading text-base">Kedolik Swap</span>
            </div>
            <p className="text-gray-400 text-sm">The Swap Hub for Alpha Hunters</p>
          </div>

          <div className="text-left">
            <h4 className="font-bold mb-4 font-heading text-base">Swap</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><Link to="/pools" className="hover:text-brand-cyan transition-colors">Pools</Link></li>
              <li><Link to="/swap" className="hover:text-brand-cyan transition-colors">Farming</Link></li>
              <li><Link to="/swap" className="hover:text-brand-cyan transition-colors">Bridge</Link></li>
            </ul>
          </div>

          <div className="text-left">
            <h4 className="font-bold mb-4 font-heading text-base">Earn</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              {kedolikDevnetEnabled && (
                <>
                  <li><Link to="/kedolik-locker" className="hover:text-brand-cyan transition-colors">Kedolik Locker</Link></li>
                  <li><Link to="/kedolik-staking" className="hover:text-brand-cyan transition-colors">Kedolik Staking</Link></li>
                </>
              )}
              <li>
                <a href="https://kedolik-swap.gitbook.io/kedolik-swap-docs/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-cyan transition-colors">Guide</a>
              </li>
            </ul>
          </div>

          <div className="text-left">
            <h4 className="font-bold mb-4 font-heading text-base">Follow us</h4>
            <div className="flex gap-3 flex-wrap">
              <a href="https://x.com/kedolik_swap" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M18.9 3H21l-6.6 7.5L22 21h-6.8l-5.3-6.5L3.8 21H2l7.2-8.2L2 3h6.9l4.8 5.9L18.9 3zm-1.2 16h1.8L8.5 5H6.7l11 14z"/>
                </svg>
              </a>
              <a href="https://t.me/Kedolik_Swap" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M9.04 14.62l-.35 4.96c.5 0 .72-.22.98-.49l2.36-2.26 4.89 3.58c.9.5 1.54.24 1.78-.83l3.22-15.1h.01c.28-1.32-.48-1.84-1.35-1.52L1.6 9.45C.32 9.95.34 10.7 1.38 11.03l4.87 1.52 11.3-7.13c.53-.33 1.02-.15.62.19L9.04 14.62z"/>
                </svg>
              </a>
              <a href="https://www.facebook.com/kedolik/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.3.2 2.3.2v2.6h-1.3c-1.3 0-1.7.8-1.7 1.6V12h2.9l-.5 2.9h-2.4v7A10 10 0 0022 12z"/>
                </svg>
              </a>
              <a href="https://www.instagram.com/kedolikswap/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm0 2a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H7zm5 3.5A5.5 5.5 0 1112 18.5 5.5 5.5 0 0112 7.5zm0 2A3.5 3.5 0 1015.5 13 3.5 3.5 0 0012 9.5zm5.75-3a1.25 1.25 0 11-1.25 1.25A1.25 1.25 0 0117.75 6.5z"/>
                </svg>
              </a>
              <a href="https://medium.com/@kedolik" target="_blank" rel="noopener noreferrer" aria-label="Medium" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
                  <path d="M4.8 7.2a1 1 0 00-.32-.84L2.3 4.02v-.3h6.3l4.9 10.76 4.3-10.76h6v.3l-1.7 1.63a.6.6 0 00-.23.58v11.7a.6.6 0 00.23.58l1.66 1.63v.3h-8.5v-.3l1.72-1.68c.17-.17.17-.22.17-.48V8.49l-4.8 12.38h-.65L6.9 8.49v7.86a1.1 1.1 0 00.3.91l2.24 2.73v.3H2v-.3l2.24-2.73c.2-.2.3-.52.25-.8V7.2z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Copyright - Same for mobile and desktop */}
        <div className="border-t border-white/10 pt-6 text-center text-gray-400 text-xs sm:text-sm">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
            <p>Copyright © Kedolik Swap 2025. All rights reserved</p>
            <span className="hidden sm:inline">•</span>
            <a href="https://kedolik.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-cyan transition-colors">Privacy Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


