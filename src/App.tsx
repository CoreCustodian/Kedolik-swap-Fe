import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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

