# Troubleshooting Guide

## Fixed Issues

### 1. Buffer Polyfill Error ✅
**Error**: `Module "buffer" has been externalized for browser compatibility`

**Solution**: Updated `vite.config.ts` to include proper Node.js polyfills for the browser.

### 2. Wrong RPC Endpoint ✅
**Error**: `api.mainnet-beta.solana.com/:1 Failed to load resource: 403`

**Solution**: Changed RPC endpoint from mainnet to devnet in `src/utils/solana.ts`.

### 3. Anchor IDL Parsing Error ✅
**Error**: `Cannot read properties of undefined (reading 'size')`

**Solution**: Properly cast the JSON IDL to Anchor's `Idl` type in `src/utils/amm.ts`.

### 4. Token Balances Display ✅
**Issue**: Token balances not shown

**Solution**: Added a comprehensive balance display in the Swap page sidebar showing all token balances.

## How to Apply Fixes

### Step 1: Stop the Dev Server
```bash
# Press Ctrl+C in your terminal to stop the server
```

### Step 2: Clear Cache and Reinstall
```bash
# Clear node modules and cache
rm -rf node_modules .vite
npm install

# If on Windows PowerShell:
Remove-Item -Recurse -Force node_modules, .vite
npm install
```

### Step 3: Restart Dev Server
```bash
npm run dev
```

### Step 4: Clear Browser Cache
- Open Developer Tools (F12)
- Right-click on the refresh button
- Select "Empty Cache and Hard Reload"
- Or use Ctrl+Shift+R (Cmd+Shift+R on Mac)

## Verification Checklist

After restarting, verify:

- [x] No buffer errors in console
- [x] RPC endpoint shows `api.devnet.solana.com`
- [x] No IDL parsing errors
- [x] Token balances appear when wallet connected
- [x] Network shows "Devnet" in the sidebar

## Common Issues

### Issue: Still seeing mainnet errors
**Solution**: Make sure your browser cached the old code. Do a hard refresh (Ctrl+Shift+R).

### Issue: Wallet connects to mainnet
**Solution**: 
1. Open your wallet (Phantom/Solflare)
2. Go to Settings
3. Change network to **Devnet**
4. Reconnect wallet

### Issue: No token balances showing
**Solution**: 
1. Make sure you're on Devnet
2. You need to create token accounts first
3. Use the faucet or create pools to get tokens

### Issue: "Pool not found" error
**Solution**: You need to create pools first using the "Create New Pool" button on the Pools page.

## Testing Flow

1. **Get Devnet SOL**
   ```
   Visit: https://faucet.solana.com
   Enter your wallet address
   Request 2 SOL
   ```

2. **Create Test Tokens** (if needed)
   ```bash
   # Using Solana CLI
   spl-token create-account <TOKEN_MINT> --url devnet
   ```

3. **Create a Pool**
   - Go to Pools page
   - Click "Create New Pool"
   - Select SOL and USDC
   - Enter amounts (e.g., 1 SOL and 10 USDC)
   - Confirm transaction

4. **Test Swap**
   - Go to Swap page
   - Check that your balances show up in the sidebar
   - Select tokens
   - Enter amount
   - Execute swap

## Environment Variables

The app now uses these environment variables (in `.env`):

```env
VITE_RPC_URL=https://api.devnet.solana.com
VITE_NETWORK=devnet
```

If you want to use a custom RPC:
```env
VITE_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
VITE_NETWORK=devnet
```

## Network Configuration

### Current Setup (Devnet)
- RPC: `https://api.devnet.solana.com`
- Program ID: `F3mHkHDh3A61A3mp9dd35DzhypacRRKeEKYDNh4dQqRc`
- AMM Config: `3EUgq3MYni6ui7EWnQaDfRXdJTqYPN4GsFFYd1Nb7ab6`

### Token Mints (Devnet)
```
KEDOLOG: DhKDRUdDLeSGM8tQjsCF8vewTffPFZwi3voZunY7RNsW
USDC:    2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32
SOL:     6xuEzd4YE3XRXWdSRKZ6V2LELkR6tocvPcnu18E8rwjv
ETH:     CTHA8taNT2LgyQyj2xVD38nmnxTsCbAJ22Vsee4RvHF3
BTC:     ErGy4n8vBRw2mscMgbZg5rf3SdyDdk11LsaXKG8JJsoa
```

## Browser Console

To check if everything is working:

1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for:
   - ✅ No buffer errors
   - ✅ No 403 errors
   - ✅ "Devnet mode: Skipping price fetching" (this is normal)
   - ✅ Wallet connected messages

## Still Having Issues?

If you're still experiencing problems after following all steps:

1. **Check your wallet**:
   - Is it set to Devnet?
   - Do you have devnet SOL?

2. **Check the browser console** for any remaining errors

3. **Try a different browser** to rule out cache issues

4. **Verify the IDL file** is correctly placed:
   ```
   kedolik_cp_swap.json should be in the project root
   ```

5. **Check that all dependencies are installed**:
   ```bash
   npm list @coral-xyz/anchor @solana/web3.js @solana/wallet-adapter-react
   ```

## Success Indicators

You know everything is working when:

- ✅ Wallet connects without errors
- ✅ Network shows "Devnet" in the UI
- ✅ Token balances display in the sidebar
- ✅ No console errors
- ✅ Pools page loads (even if empty)
- ✅ Create Pool modal opens
- ✅ Swap interface shows pool status

---

**Last Updated**: October 23, 2025  
**Network**: Solana Devnet  
**Status**: All critical issues resolved


