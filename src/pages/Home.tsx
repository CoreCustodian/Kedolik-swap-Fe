import { Link } from 'react-router-dom';

const Home = () => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-dark">
      {/* Animated Mesh Background */}
      <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-20 left-10 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Hero Section */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left Side - 3D Logo */}
          <div className="flex justify-center order-2 md:order-1">
            <div className="relative animate-float">
              <img 
                src="/hero/hero1.png" 
                alt="Kedolik Swap Logo" 
                className="w-full max-w-md drop-shadow-[0_0_60px_rgba(255,28,247,0.5)]"
              />
              <div className="absolute -inset-8 bg-gradient-brand rounded-full blur-3xl opacity-30 animate-pulse-slow"></div>
            </div>
          </div>

          {/* Right Side - Hero Content */}
          <div className="space-y-6 order-1 md:order-2">
            <div className="inline-block">
              <span className="px-5 py-2 bg-brand-cyan/10 border border-brand-cyan/30 rounded-full text-brand-cyan text-sm font-semibold backdrop-blur-sm">
                Welcome to Kedolik Swap
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              The Next Generation{' '}
              <span className="block mt-2">Decentralized</span>
            </h1>
            
            <div className="relative">
              <img 
                src="/hero/EXCHANGE.png" 
                alt="EXCHANGE" 
                className="w-full max-w-2xl"
              />
            </div>

            <p className="text-lg md:text-xl text-gray-300 leading-relaxed max-w-xl pt-4">
              Kedolik Swap is a next-generation decentralized exchange offering secure, 
              lightning-fast, and low-cost crypto trading across multiple blockchains.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-6">
              <Link to="/swap" className="btn-primary text-center inline-flex items-center justify-center gap-2">
                Trade Now
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <button className="btn-secondary inline-flex items-center justify-center gap-2">
                Learn more
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Scroll Down Indicator */}
        <div className="flex flex-col items-center mt-20 animate-bounce">
          <span className="text-brand-cyan text-sm mb-2 font-medium">Scroll Down</span>
          <svg className="w-6 h-6 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              img: '/hero/noncustodial.png',
              title: 'Non-Custodial',
              description: 'You own your keys, you own your crypto.'
            },
            {
              img: '/hero/fasttx.png',
              title: 'Fast Transactions',
              description: 'High-performance smart contracts.'
            },
            {
              img: '/hero/multichain.png',
              title: 'Multi-Chain & Aggregated',
              description: 'Trade across blockchains with best prices.'
            },
            {
              img: '/hero/lowfees.png',
              title: 'Low Fees',
              description: 'Keep more of your profits'
            }
          ].map((feature, index) => (
            <div key={index} className="card p-8 group hover:scale-105 transition-all duration-300">
              <div className="w-16 h-16 mb-4 group-hover:scale-110 transition-transform duration-300">
                <img src={feature.img} alt={feature.title} className="w-full h-full object-contain" />
              </div>
              <h3 className="text-xl font-bold mb-3 font-heading">{feature.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The Heart of Kedolik Swap Section */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="card p-12">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <h2 className="text-4xl md:text-5xl font-bold font-heading">
                The Heart of Kedolik <span className="gradient-text">Swap</span>
              </h2>
              <p className="text-gray-300 text-lg">
                The $KEDOL token fuels the Kedolik Swap ecosystem:
              </p>
              
              <div className="space-y-4">
                {[
                  { icon: '💎', text: 'Reduced trading fees' },
                  { icon: '🎁', text: 'Exclusive staking rewards' },
                  { icon: '🗳️', text: 'Governance rights' },
                  { icon: '🚀', text: 'Early access to new launches' }
                ].map((item, index) => (
                  <div key={index} className="flex items-center gap-4 group">
                    <div className="w-12 h-12 bg-gradient-brand rounded-full flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      {item.icon}
                    </div>
                    <span className="text-lg font-medium">{item.text}</span>
                  </div>
                ))}
              </div>

              <button className="btn-primary">
                Buy $KEDOL
              </button>
            </div>

            <div className="flex justify-center">
              <div className="relative">
                <img 
                  src="/hero/hero2.png" 
                  alt="KEDOL Token" 
                  className="w-full max-w-lg animate-float"
                />
                <div className="absolute inset-0 bg-gradient-brand rounded-full blur-3xl opacity-20 animate-pulse-slow"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Everything You Need Section */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold font-heading mb-4">
            <span className="gradient-text">E</span>verything You Need in One <span className="gradient-text">DEX</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {[
            {
              icon: '⚡',
              title: 'Swap Instantly, Anytime',
              description: 'Trade tokens at competitive rates, powered by our automated market maker (AMM) for 24/7 liquidity.'
            },
            {
              icon: '💵',
              title: 'Best Price, Every Time',
              description: "Kedolik Swap's built-in DEX aggregator scans multiple liquidity sources to find you the best available swap rates."
            },
            {
              icon: '💰',
              title: 'Earn While You Trade',
              description: 'Provide liquidity and farm rewards with smart strategies for sustainable, passive income.'
            },
            {
              icon: '🔧',
              title: 'Power the Platform',
              description: 'Stake $KEDOL tokens for extra rewards and vote on key platform decisions.'
            },
            {
              icon: '🌉',
              title: 'One Bridge, Endless Possibilities',
              description: 'Move assets seamlessly between chains without paying multiple platforms.'
            }
          ].map((feature, index) => (
            <div key={index} className="card p-8 group hover:scale-105 transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-brand rounded-2xl flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform shadow-glow-brand">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-3 font-heading">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Security & Vision Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card p-10">
            <h3 className="text-3xl font-bold mb-6 font-heading gradient-text">Security You Can Trust</h3>
            <p className="text-gray-300 mb-6 leading-relaxed">
              With advanced encryption and a fully decentralized architecture, Kedolik 
              puts your safety first. Every transaction is transparent and verifiable 
              on-chain.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-brand-cyan/20 rounded-full flex items-center justify-center">
                <span className="text-3xl">🛡️</span>
              </div>
              <div className="w-16 h-16 bg-gradient-brand rounded-full flex items-center justify-center shadow-glow-brand">
                <span className="text-2xl font-bold">K</span>
              </div>
              <div className="w-16 h-16 bg-brand-pink/20 rounded-full flex items-center justify-center">
                <span className="text-3xl">🔒</span>
              </div>
            </div>
          </div>

          <div className="card p-10">
            <h3 className="text-3xl font-bold mb-6 font-heading gradient-text">Building a Truly Open Financial World</h3>
            <p className="text-gray-300 mb-6 leading-relaxed">
              Our mission is simple – empower users everywhere to trade, earn, and grow 
              without the barriers of traditional finance.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-brand-pink/20 rounded-full flex items-center justify-center">
                <span className="text-3xl">🌍</span>
              </div>
              <div className="w-16 h-16 bg-gradient-brand rounded-full flex items-center justify-center shadow-glow-brand">
                <span className="text-2xl font-bold">K</span>
              </div>
              <div className="w-16 h-16 bg-brand-cyan/20 rounded-full flex items-center justify-center">
                <span className="text-3xl">📈</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Start in 3 Steps Section */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold font-heading mb-4">
            Start in Just 3 Steps
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {[
            {
              step: '1',
              title: 'Connect Wallet',
              description: 'Works with Phantom, Solflare, and more.'
            },
            {
              step: '2',
              title: 'Choose Your Trade',
              description: 'Select tokens and confirm your swap.'
            },
            {
              step: '3',
              title: 'Earn & Grow',
              description: 'Add liquidity, stake, and watch your assets grow.'
            }
          ].map((step, index) => (
            <div key={index} className="card p-8 text-center group hover:scale-105 transition-all duration-300">
              <div className="w-20 h-20 bg-gradient-brand rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-glow-brand group-hover:scale-110 transition-transform">
                {step.step}
              </div>
              <h3 className="text-2xl font-bold mb-3 font-heading">{step.title}</h3>
              <p className="text-gray-400">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link to="/swap" className="btn-primary text-lg">
            Trade Now
          </Link>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 mb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-brand p-1">
          <div className="bg-dark-900 rounded-3xl p-12 md:p-20 text-center">
            <h2 className="text-4xl md:text-6xl font-bold font-heading mb-8">
              Ready to Join the DeFi Revolution?
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button className="btn-primary bg-white text-brand-pink hover:bg-gray-100">
                Buy $KEDOL
              </button>
              <Link to="/swap" className="btn-secondary">
                Trade Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/10 bg-dark-900/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/logo.png" alt="Kedolik" className="w-8 h-8" />
                <span className="font-bold gradient-text font-heading">KEDOLIK SWAP</span>
              </div>
              <p className="text-gray-400 text-sm">
                The Swap Hub for Alpha Hunters
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-4 font-heading">Swap</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link to="/pools" className="hover:text-brand-cyan transition-colors">Pools</Link></li>
                <li><Link to="/swap" className="hover:text-brand-cyan transition-colors">Farming</Link></li>
                <li><Link to="/swap" className="hover:text-brand-cyan transition-colors">Bridge</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4 font-heading">Earn</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link to="/pools" className="hover:text-brand-cyan transition-colors">Staking</Link></li>
                <li><Link to="/pools" className="hover:text-brand-cyan transition-colors">Guide</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4 font-heading">Follow us on</h4>
              <div className="flex gap-4">
                {['𝕏', '📱', '📢', '▶️'].map((icon, i) => (
                  <button 
                    key={i}
                    className="w-10 h-10 bg-white/5 hover:bg-gradient-brand rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110"
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 text-center text-gray-400 text-sm">
            <p>Copyright © Kedolik Swap 2025. All rights reserved</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
