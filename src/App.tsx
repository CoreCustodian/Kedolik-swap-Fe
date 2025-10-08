import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './contexts/WalletProvider';
import { UserProvider } from './contexts/UserContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Swap from './pages/Swap';
import Pools from './pages/Pools';
import Profile from './pages/Profile';

function App() {
  return (
    <WalletProvider>
      <UserProvider>
        <Router>
          <div className="min-h-screen bg-gradient-dark">
            <Navbar />
            <div className="pt-20">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/swap" element={<Swap />} />
                <Route path="/pools" element={<Pools />} />
                <Route path="/profile" element={<Profile />} />
              </Routes>
            </div>
          </div>
        </Router>
      </UserProvider>
    </WalletProvider>
  );
}

export default App;

