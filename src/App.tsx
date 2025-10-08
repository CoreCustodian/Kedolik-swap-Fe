import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './contexts/WalletProvider';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Swap from './pages/Swap';
import Pools from './pages/Pools';

function App() {
  return (
    <WalletProvider>
      <Router>
        <div className="min-h-screen bg-gradient-dark">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/pools" element={<Pools />} />
          </Routes>
        </div>
      </Router>
    </WalletProvider>
  );
}

export default App;

