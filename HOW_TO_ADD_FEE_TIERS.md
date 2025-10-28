# 🎯 How to Add New Fee Tiers (Simple Guide)

## ✅ Now Fully Configurable!

Fee tiers are no longer hardcoded! You can add new fee tiers by simply editing one configuration file.

---

## 📝 Quick Steps

### **Step 1: Edit the Fee Configuration File**

Open `src/config/fees.ts` and add your new fee tier:

```typescript
export const FEE_TIER_CONFIGS: FeeConfig[] = [
  {
    index: 0,
    feeBps: 100, // 1.00%
    label: '1.00%',
    description: 'Best for volatile pairs'
  },
  // ADD YOUR NEW FEE TIERS HERE 👇
  {
    index: 1,
    feeBps: 30, // 0.30%
    label: '0.30%',
    description: 'Best for standard pairs'
  },
  {
    index: 2,
    feeBps: 25, // 0.25%
    label: '0.25%',
    description: 'Best for popular pairs (SOL/USDC)'
  },
  {
    index: 3,
    feeBps: 5, // 0.05%
    label: '0.05%',
    description: 'Best for stable pairs (USDC/USDT)'
  }
];
```

**That's it!** The addresses are calculated automatically! 🎉

---

## 🔧 What Each Field Means

| Field | Description | Example |
|-------|-------------|---------|
| `index` | Unique number (0, 1, 2...) | `1` |
| `feeBps` | Fee in basis points | `25` (= 0.25%) |
| `label` | Display name | `'0.25%'` |
| `description` | Explanation for users | `'Best for popular pairs'` |

### **Fee Basis Points Calculator:**

| You Want | feeBps Value |
|----------|--------------|
| 1.00% | `100` |
| 0.50% | `50` |
| 0.30% | `30` |
| 0.25% | `25` |
| 0.10% | `10` |
| 0.05% | `5` |
| 0.01% | `1` |

---

## ⚠️ Important: Create AMM Config On-Chain First!

Before the fee tier works, you need to create the AMM config on the blockchain using your **admin account**.

### **Create AMM Config Command:**

```bash
# For 0.25% fee tier (index 1)
anchor run create-amm-config -- \
  --index 1 \
  --trade-fee-rate 2500 \
  --protocol-fee-rate 500 \
  --fund-fee-rate 500 \
  --create-pool-fee 10000000 \
  --creator-fee-rate 1000
```

**Trade Fee Rate in basis points:**
- 0.25% = `2500`
- 0.30% = `3000`
- 0.05% = `500`
- 1.00% = `10000`

---

## 🎨 User Experience

After adding fee tiers, users will see them when creating pools:

```
┌─────────────────────────────────────┐
│ Fee Tier                            │
│                                     │
│ ✓ 1.00% - Best for volatile pairs  │
│   0.30% - Best for standard pairs   │
│   0.25% - Best for popular pairs    │
│   0.05% - Best for stable pairs     │
└─────────────────────────────────────┘
```

---

## 🚀 Example: Add 0.25% and 0.05% Fee Tiers

### **1. Edit `src/config/fees.ts`:**

```typescript
export const FEE_TIER_CONFIGS: FeeConfig[] = [
  {
    index: 0,
    feeBps: 100,
    label: '1.00%',
    description: 'Best for volatile pairs'
  },
  {
    index: 1,
    feeBps: 25,
    label: '0.25%',
    description: 'Best for standard pairs'
  },
  {
    index: 2,
    feeBps: 5,
    label: '0.05%',
    description: 'Best for stable pairs'
  }
];
```

### **2. Create AMM configs on-chain:**

```bash
# Create 0.25% config (index 1)
anchor run create-amm-config -- \
  --index 1 \
  --trade-fee-rate 2500 \
  --protocol-fee-rate 500 \
  --fund-fee-rate 500 \
  --create-pool-fee 10000000 \
  --creator-fee-rate 1000

# Create 0.05% config (index 2)
anchor run create-amm-config -- \
  --index 2 \
  --trade-fee-rate 500 \
  --protocol-fee-rate 100 \
  --fund-fee-rate 100 \
  --create-pool-fee 10000000 \
  --creator-fee-rate 100
```

### **3. Refresh your browser - Done!** ✅

The new fee tiers will automatically appear in the UI!

---

## 🔍 How It Works (Technical)

### **Automatic Address Calculation:**

The system automatically calculates the AMM config address using:

```typescript
const [ammConfig] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('amm_config'),
    Buffer.from([index, 0]) // index as u16 little-endian
  ],
  PROGRAM_ID
);
```

This means:
- ✅ No need to hardcode addresses
- ✅ Just add to the config array
- ✅ Addresses calculated on-the-fly
- ✅ Always in sync with on-chain data

---

## ✅ Verification

To verify your AMM config was created:

```bash
# Calculate the address (example for index 1)
# Run this in Node.js or browser console
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('GCm8bqvSuJ4nwj3SN3pk2eSJWTwcRjkU6KhXE96AnBod');
const indexBuffer = Buffer.alloc(2);
indexBuffer.writeUInt16LE(1, 0);

const [ammConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from('amm_config'), indexBuffer],
  PROGRAM_ID
);

console.log('AMM Config Address:', ammConfig.toBase58());

# Then check if it exists on-chain
solana account <AMM_CONFIG_ADDRESS> --url devnet
```

---

## 📊 Benefits of This System

| Before | After |
|--------|-------|
| ❌ Hardcoded in multiple files | ✅ Single config file |
| ❌ Manual address calculation | ✅ Automatic calculation |
| ❌ Error-prone | ✅ Simple & safe |
| ❌ Need to edit multiple places | ✅ Edit one file |

---

## 🎯 Summary

### **To Add a New Fee Tier:**

1. ✅ **Add to config** → Edit `src/config/fees.ts`
2. ✅ **Create on-chain** → Run admin command
3. ✅ **Refresh browser** → See it in UI!

**No code changes needed!** Just configuration! 🎉

---

## 📚 See Also

- `FEE_TIER_CONFIGURATION.md` - Detailed technical guide
- `src/config/fees.ts` - Configuration file
- `CHANGELOG.md` - Recent changes

---

**Status**: ✅ **Fully Configurable**  
**Date**: October 27, 2025



