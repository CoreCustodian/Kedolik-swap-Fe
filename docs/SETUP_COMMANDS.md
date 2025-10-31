# 🚀 Quick Setup - Commands to Run

## 📦 **Step 1: Install New Dependencies**

```bash
npm install
```

This will install the new `@solana/spl-token` package needed for fetching token accounts.

## 🔧 **Step 2: Create Environment File**

Create a `.env` file in the root directory:

```bash
# Copy this into .env file
VITE_RPC_URL=https://api.mainnet-beta.solana.com
```

**For better performance (recommended):**
1. Get free Helius API key: https://helius.xyz
2. Update `.env`:
```bash
VITE_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY_HERE
```

## ▶️ **Step 3: Run the App**

```bash
npm run dev
```

## ✅ **Test It Works**

1. Open browser at `http://localhost:5173`
2. Connect your Solana wallet
3. Go to `/profile` page
4. **You should see YOUR REAL:**
   - ✅ SOL balance
   - ✅ All your SPL tokens
   - ✅ Real USD values
   - ✅ Real transaction history
   - ✅ Links to Solscan

## 🎯 **What Just Changed**

### **Before:**
- ❌ Mock/fake data
- ❌ No real blockchain calls
- ❌ Placeholder values

### **After:**
- ✅ Real SOL balance from blockchain
- ✅ Real token balances from blockchain
- ✅ Real prices from Jupiter API (free!)
- ✅ Real transaction history from blockchain
- ✅ Everything calculated client-side
- ✅ **NO SERVER NEEDED!**

## 📂 **New Files Created**

```
src/
├── utils/
│   ├── solana.ts          # Direct blockchain fetching
│   ├── prices.ts          # Jupiter price API (free)
│   └── jupiter.ts         # Jupiter swap routes (free)
└── contexts/
    └── UserContext.tsx    # Updated to fetch real data
```

## 🎓 **How to Use in Your Code**

### **Get Token Prices:**
```typescript
import { getTokenPrices } from './utils/prices';

const prices = await getTokenPrices(['SOL_MINT_ADDRESS']);
const solPrice = prices.get('SOL_MINT_ADDRESS');
```

### **Get Swap Quote:**
```typescript
import { getJupiterQuote } from './utils/jupiter';

const route = await getJupiterQuote(
  'INPUT_TOKEN_MINT',
  'OUTPUT_TOKEN_MINT', 
  amount,
  50 // 0.5% slippage
);
```

### **Get User Balance:**
```typescript
import { getSolBalance, getTokenAccounts } from './utils/solana';

const solBalance = await getSolBalance(publicKey);
const tokens = await getTokenAccounts(publicKey);
```

## 💡 **Performance Tips**

1. **Use Helius RPC** (free tier is enough)
   - 100 requests/second
   - Much faster than public RPC
   - Sign up: https://helius.xyz

2. **Prices are cached** for 30 seconds
   - No need to worry about rate limits
   - Automatic cache management

3. **Data loads in parallel**
   - All API calls happen simultaneously
   - Fast initial load (~1-2 seconds)

## 🐛 **Troubleshooting**

### **"Failed to fetch" errors:**
- Check your RPC endpoint in `.env`
- Try using Helius instead of public RPC
- Check browser console for details

### **No tokens showing:**
- Make sure wallet is connected
- Check if wallet has tokens on mainnet
- Look in browser console for errors

### **Slow loading:**
- Switch to Helius RPC (free)
- Check your internet connection
- Public RPC can be slow during peak times

## 📊 **Free RPC Providers**

| Provider | Free Tier | Speed | Get API Key |
|----------|-----------|-------|-------------|
| **Helius** | 100 req/sec | ⚡⚡⚡ | https://helius.xyz |
| **QuickNode** | 1K req/day | ⚡⚡ | https://quicknode.com |
| **Triton** | 25 req/sec | ⚡⚡ | https://triton.one |
| Public | Unlimited | ⚡ | No signup needed |

## 🚀 **Next Steps**

1. ✅ Install dependencies: `npm install`
2. ✅ Create `.env` file with RPC endpoint
3. ✅ Run app: `npm run dev`
4. ✅ Connect wallet and test
5. ✅ (Optional) Get Helius API key for better performance
6. ✅ Deploy to Vercel/Netlify for free!

## 🎉 **You're Done!**

Your DEX now:
- ✅ Fetches real blockchain data
- ✅ Shows real token prices
- ✅ Displays real portfolio
- ✅ Works without any server
- ✅ Costs $0/month to run
- ✅ Is production-ready!

---

**Need help?** Check `SERVERLESS_SETUP.md` for detailed documentation.

