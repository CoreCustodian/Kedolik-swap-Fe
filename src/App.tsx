import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { WalletProvider } from './contexts/WalletProvider';
import { UserProvider } from './contexts/UserContext';
import { ConfigProvider } from './contexts/ConfigContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Swap from './pages/Swap';
import Pools from './pages/Pools';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import KedolikLocker from './pages/KedolikLocker';
import KedolikStaking from './pages/KedolikStaking';
import KedolikFun from './pages/KedolikFun';
import KedolikPad from './pages/KedolikPad';
import Footer from './components/Footer';

function App() {
  return (
    <WalletProvider>
      <UserProvider>
        <ConfigProvider>
          <Router>
          <div className="min-h-screen bg-gradient-dark">
            <Navbar />
            <div className="pt-20">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/swap" element={<Swap />} />
                <Route path="/pools" element={<Pools />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/kedolik" element={<Navigate to="/kedolik-locker" replace />} />
                <Route path="/kedolik-locker" element={<KedolikLocker />} />
                <Route path="/kedolik-staking" element={<KedolikStaking />} />
                <Route path="/KedolFun" element={<KedolikFun />} />
                <Route path="/KedolPad" element={<KedolikPad />} />
                <Route path="/kedolikfun" element={<Navigate to="/KedolFun" replace />} />
                <Route path="/kedolikpad" element={<Navigate to="/KedolPad" replace />} />
              </Routes>
            </div>
            <Footer />
          </div>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1a1b23',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </Router>
        </ConfigProvider>
      </UserProvider>
    </WalletProvider>
  );
}

export default App;

