# Kedolik Swap - Solana Devnet Integration Guide

## Overview

Your Kedolik Swap frontend has been successfully integrated with your Solana devnet AMM contracts. The integration includes:

- ✅ Token swapping with real-time quotes
- ✅ Liquidity pool management
- ✅ Pool creation functionality
- ✅ Add/remove liquidity
- ✅ Real-time balance tracking
- ✅ Transaction confirmation

## Contract Information

**Network:** Solana Devnet  
**Program ID:** `F3mHkHDh3A61A3mp9dd35DzhypacRRKeEKYDNh4dQqRc`  
**AMM Config:** `3EUgq3MYni6ui7EWnQaDfRXdJTqYPN4GsFFYd1Nb7ab6`

### Devnet Tokens

| Token | Mint Address | Decimals |
|-------|-------------|----------|
| KEDOLOG | `DhKDRUdDLeSGM8tQjsCF8vewTffPFZwi3voZunY7RNsW` | 9 |
| USDC | `2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32` | 6 |
| SOL | `6xuEzd4YE3XRXWdSRKZ6V2LELkR6tocvPcnu18E8rwjv` | 9 |
| ETH | `CTHA8taNT2LgyQyj2xVD38nmnxTsCbAJ22Vsee4RvHF3` | 18 |
| BTC | `ErGy4n8vBRw2mscMgbZg5rf3SdyDdk11LsaXKG8JJsoa` | 8 |

## Setup Instructions

### 1. Install Dependencies

All required dependencies are already in your `package.json`. Run:

```bash
npm install
```

### 2. Environment Configuration (Optional)

Create a `.env` file in the root directory for custom RPC:

```bash
VITE_RPC_URL=https://api.devnet.solana.com
VITE_NETWORK=devnet
```

For better performance, you can use a premium RPC provider:
- **Helius:** https://helius.dev
- **QuickNode:** https://quicknode.com
- **Alchemy:** https://alchemy.com

### 3. Start Development Server

```bash
npm run dev
```

### 4. Test the Integration

1. **Connect Wallet**
   - Use Phantom, Solflare, or any Solana wallet
   - Make sure you're on **Devnet**
   - Get devnet SOL from: https://faucet.solana.com

2. **Get Test Tokens**
   - You need tokens to test swaps and pools
   - Use the Solana CLI to mint test tokens to your wallet:
   ```bash
   spl-token create-account <TOKEN_MINT> --url devnet
   ```

3. **Create a Pool**
   - Go to the **Pools** page
   - Click "Create New Pool"
   - Select two tokens and enter initial amounts
   - Confirm the transaction

4. **Test Swapping**
   - Go to the **Swap** page
   - Select tokens
   - Enter amount
   - Execute swap

## Key Features

### Swap Page (`src/pages/Swap.tsx`)

- **Token Selection:** Choose from 5 devnet tokens
- **Real-time Quotes:** Automatic quote calculation based on pool reserves
- **Slippage Protection:** Configurable slippage tolerance
- **Balance Display:** Real-time token balances
- **Price Impact:** Shows how your trade affects the pool price
- **Transaction Confirmation:** Links to Solana Explorer

### Pools Page (`src/pages/Pools.tsx`)

- **Pool List:** Displays all active pools with reserves
- **Add Liquidity:** Proportional liquidity addition
- **Create Pool:** Initialize new trading pairs
- **Real-time Stats:** TVL, volume, and pool metrics

## File Structure

```
src/
├── components/
│   └── Navbar.tsx               # Navigation with wallet connect
├── contexts/
│   ├── WalletProvider.tsx       # Solana wallet setup (Devnet)
│   └── UserContext.tsx          # User state management
├── pages/
│   ├── Swap.tsx                 # ✅ Integrated swap interface
│   ├── Pools.tsx                # ✅ Integrated pool management
│   ├── Home.tsx                 # Landing page
│   └── Profile.tsx              # User profile
├── utils/
│   ├── amm.ts                   # ✅ Core AMM functions
│   ├── solana.ts                # Solana utilities
│   ├── prices.ts                # Price fetching
│   └── jupiter.ts               # Jupiter aggregator (optional)
├── config/
│   └── tokens.ts                # ✅ Token list configuration
├── App.tsx                      # Main app component
└── main.tsx                     # Entry point
```

## Core Functions

### AMM Utilities (`src/utils/amm.ts`)

#### Swap Functions
```typescript
// Execute swap with input amount
swapBaseInput(connection, wallet, inputMint, outputMint, amountIn, minAmountOut, slippage)

// Calculate expected output
calculateSwapOutput(amountIn, reserveIn, reserveOut, tradeFeeRate)
```

#### Pool Functions
```typescript
// Fetch all pools
fetchPools(connection, wallet)

// Get specific pool state
getPoolState(token0Mint, token1Mint)

// Create new pool
createPool(connection, wallet, token0Mint, token1Mint, initAmount0, initAmount1)
```

#### Liquidity Functions
```typescript
// Add liquidity to pool
addLiquidity(connection, wallet, token0Mint, token1Mint, amount0, amount1, slippage)

// Remove liquidity from pool
removeLiquidity(connection, wallet, token0Mint, token1Mint, lpAmount, minAmount0, minAmount1)
```

## Testing Checklist

- [ ] Connect wallet on devnet
- [ ] View token balances
- [ ] Create a new pool (e.g., SOL/USDC)
- [ ] Add liquidity to the pool
- [ ] Execute a swap
- [ ] View pool stats
- [ ] Check transaction on Solana Explorer

## Troubleshooting

### "Pool not found" Error
- Create a pool for the token pair first
- Make sure you're on devnet
- Check that tokens have liquidity

### "Insufficient balance" Error
- Get devnet SOL: https://faucet.solana.com
- Mint test tokens to your wallet
- Check token accounts exist

### Transaction Fails
- Increase slippage tolerance
- Check you have enough SOL for fees (~0.001 SOL per tx)
- Verify token accounts are created

### Wallet Not Connecting
- Make sure wallet is on devnet
- Try refreshing the page
- Clear browser cache

## Important Notes

1. **Devnet Only:** This integration is configured for Solana devnet. To use mainnet:
   - Update `WalletProvider.tsx` network to `mainnet-beta`
   - Update token mints in `src/config/tokens.ts`
   - Update program ID and AMM config in `src/utils/amm.ts`

2. **Token Accounts:** Users need token accounts for each token. The app will create them automatically if they don't exist (costs ~0.002 SOL per account).

3. **Fees:** 
   - Network fee: ~0.00005 SOL per transaction
   - Trading fee: 0.01% (100 basis points) of swap amount
   - Pool creation fee: Check `ammConfig.createPoolFee`

4. **Slippage:** Default is 0.5%. Increase for volatile pairs or large trades.

5. **Real Prices:** For production, integrate price oracles (Pyth, Switchboard) to display USD values.

## Next Steps

### For Production

1. **Add Price Feeds**
   - Integrate Pyth Network for real-time prices
   - Display USD values for all tokens

2. **Add Charts**
   - Price charts using TradingView or custom solution
   - Volume and TVL charts

3. **Analytics**
   - User dashboard with portfolio tracking
   - Transaction history
   - LP position management

4. **Security**
   - Audit smart contracts
   - Add transaction simulation
   - Implement max slippage warnings

5. **UX Improvements**
   - Better error messages
   - Loading states
   - Transaction status tracking
   - Multi-step transaction flows

## Support

For issues or questions:
- Check the Solana devnet status: https://status.solana.com
- View transactions on Solana Explorer: https://explorer.solana.com/?cluster=devnet
- Solana Discord: https://solana.com/discord

## Resources

- **Solana Docs:** https://docs.solana.com
- **Anchor Framework:** https://www.anchor-lang.com
- **Solana Cookbook:** https://solanacookbook.com
- **SPL Token:** https://spl.solana.com/token

---

**Status:** ✅ Integration Complete  
**Last Updated:** October 23, 2025  
**Network:** Solana Devnet


