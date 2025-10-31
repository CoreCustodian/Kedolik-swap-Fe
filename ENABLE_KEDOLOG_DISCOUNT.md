# How to Enable KEDOLOG Discount Feature

The KEDOLOG discount feature is currently **disabled** because it requires backend configuration.

---

## ⚠️ Current Issue

The contract is rejecting KEDOLOG discount swaps with:
```
Error Code: InvalidInput
Program log: Left: 0
Program log: Right: 0
```

This means the `protocol_token_per_usd` value in the `ProtocolTokenConfig` account is not configured correctly.

---

## 🔧 Backend Configuration Required

You need to update the `ProtocolTokenConfig` account in your Anchor project with the correct KEDOLOG price.

### Step 1: Update Protocol Token Config

In your Anchor project, run this script:

```typescript
// update-protocol-token-config.ts
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const PROTOCOL_TOKEN_CONFIG = new PublicKey("7ZRkzDLJQkhYvoyKKJXHjk1qy1ArKtX8iqbNF7F4sETv");
const KEDOLOG_MINT = new PublicKey("22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.KedolikCpSwap;
  
  // Calculate KEDOLOG per USD based on your pool price
  // Example: If 1 KEDOLOG = 0.10 USDC, then 1 USD = 10 KEDOLOG
  // In lamports: 10 * 10^9 = 10_000_000_000
  const kedologPerUsd = new anchor.BN(10_000_000_000); // 10 KEDOLOG per 1 USD
  
  // Check current config
  const currentConfig = await program.account.protocolTokenConfig.fetch(PROTOCOL_TOKEN_CONFIG);
  console.log("Current config:", {
    protocolTokenPerUsd: currentConfig.protocolTokenPerUsd.toString(),
    discountRate: currentConfig.discountRate.toString(),
  });
  
  // Update config
  await program.methods
    .updateProtocolTokenConfig(
      kedologPerUsd,
      currentConfig.discountRate // Keep 20% discount
    )
    .accounts({
      owner: provider.wallet.publicKey,
      protocolTokenConfig: PROTOCOL_TOKEN_CONFIG,
    })
    .rpc();
  
  console.log("✅ Updated! New protocol_token_per_usd:", kedologPerUsd.toString());
}

main();
```

### Step 2: Verify Configuration

After running the script, verify:

```bash
solana account 7ZRkzDLJQkhYvoyKKJXHjk1qy1ArKtX8iqbNF7F4sETv --url devnet
```

---

## 🎯 Enable in Frontend

Once backend is configured, enable the feature in `src/pages/Swap.tsx`:

### Change this:
```typescript
{false && !isMultiHop && poolReserves && (
```

### To this:
```typescript
{!isMultiHop && poolReserves && (
```

---

## 🧪 Testing Checklist

After enabling, test:

1. ☐ KEDOLOG discount toggle appears on swap page
2. ☐ KEDOLOG balance shows correctly
3. ☐ Estimated fee in KEDOLOG is calculated
4. ☐ Swap with discount completes successfully
5. ☐ Protocol fee is deducted in KEDOLOG (not SOL)
6. ☐ User receives 20% more output tokens

---

## 📊 How It Works

### Normal Swap (0.25% total fee):
```
Swap 100 USDC → KEDOLOG
├── LP Fee: 0.20% = 0.20 USDC (goes to pool)
├── Protocol Fee: 0.05% = 0.05 USDC (paid in USDC)
└── Output: 980 KEDOLOG
```

### With KEDOLOG Discount:
```
Swap 100 USDC → KEDOLOG
├── LP Fee: 0.20% = 0.20 USDC (goes to pool)
├── Protocol Fee: 0.04% in KEDOLOG (20% discount!)
│   └── 0.05 USD worth = 0.5 KEDOLOG deducted
└── Output: 980.40 KEDOLOG (more tokens!)
```

**User saves: 0.01% of swap amount + gets more output!**

---

## 🔍 Troubleshooting

### Error: "InvalidInput" with Left: 0, Right: 0

**Cause:** `protocol_token_per_usd` is 0 or not set

**Fix:** Run the update script above to set the correct value

### Error: "Insufficient KEDOLOG balance"

**Cause:** User doesn't have enough KEDOLOG to pay the fee

**Solution:** This is expected - user needs KEDOLOG tokens. The UI already shows a warning.

### Discount not showing in UI

**Cause:** Frontend is disabled

**Fix:** Change `{false && ...}` to `{!isMultiHop && ...}` in Swap.tsx

---

## 📝 Current Configuration

```json
{
  "protocolTokenConfig": "7ZRkzDLJQkhYvoyKKJXHjk1qy1ArKtX8iqbNF7F4sETv",
  "kedologMint": "22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx",
  "discountRate": 2000,
  "protocolTokenPerUsd": "???" // ⚠️ Needs configuration
}
```

---

## ✅ Summary

1. **Configure backend** - Set `protocol_token_per_usd` in ProtocolTokenConfig
2. **Enable frontend** - Remove `false &&` from Swap.tsx
3. **Test** - Try swapping with KEDOLOG discount
4. **Monitor** - Check that fees are collected correctly

Once configured, users will be able to save 20% on protocol fees by paying with KEDOLOG! 🎉

