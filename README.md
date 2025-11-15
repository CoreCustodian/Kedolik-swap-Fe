# Kedolik Swap

A next-generation decentralized exchange built on Solana, offering secure, lightning-fast, and low-cost crypto trading.

## 🚀 Getting Started

### Installation Commands

Run the following commands in order:

```bash
# Install all dependencies 
npm install

# Start the development server
npm run dev
``` 




The application will be available at `http://localhost:5173`

### Build for Production

```bash
# Build the project
npm run build

# Preview the production build
npm run preview
```

## 🛠️ Tech Stack

- **React 18** - UI Framework
- **TypeScript** - Type Safety
- **Vite** - Build Tool & Dev Server
- **Tailwind CSS** - Styling
- **Solana Web3.js** - Blockchain Integration
- **Solana Wallet Adapter** - Wallet Connection (Phantom, Solflare, etc.)
- **React Router** - Navigation

## 🎨 Features

- ✨ Modern, responsive UI with dark theme
- 🔐 Solana wallet integration
- ⚡ Lightning-fast performance
- 🎯 Token swapping interface
- 💧 Liquidity pools
- 📱 Mobile-friendly design

## 🎨 Color Theme

The project uses a custom dark theme inspired by your design:
- **Primary Colors**: Cyan/Blue gradients
- **Secondary Colors**: Purple gradients
- **Background**: Dark purple/blue gradient
- **Accents**: Glow effects with cyan and purple

## 📁 Project Structure

```
kedolik-swap/
├── src/
│   ├── components/     # Reusable components
│   │   └── Navbar.tsx
│   ├── contexts/       # React contexts
│   │   └── WalletProvider.tsx
│   ├── pages/          # Page components
│   │   ├── Home.tsx
│   │   ├── Swap.tsx
│   │   └── Pools.tsx
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # Entry point
│   └── index.css       # Global styles with Tailwind
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## 🔗 Wallet Support

The following wallets are supported out of the box:
- Phantom
- Solflare

You can easily add more wallets by updating the `WalletProvider.tsx` file.

## 📝 Development

The project is configured with:
- Hot Module Replacement (HMR)
- TypeScript strict mode
- ESLint for code quality
- Tailwind CSS with custom configuration

## 🌐 Network Configuration

By default, the app connects to Solana Devnet. To change the network, edit `src/contexts/WalletProvider.tsx`:

```typescript
const network = WalletAdapterNetwork.Devnet; // Change to Mainnet or Testnet
```

## 📄 License

MIT

---

Built with ❤️ for the Solana ecosystem

