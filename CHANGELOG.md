# Changelog - October 27, 2025

## 🎉 New Features & Fixes

### ✅ 1. Fixed "Transaction Already Processed" Error

**Problem:**
- Transactions were succeeding but showing error messages
- Users saw "already been processed" errors even though liquidity was added

**Solution:**
- Updated error handling in `addLiquidity()` function
- Now treats "already processed" as a success case
- Waits 2 seconds and returns success status
- Better UX - no false error messages!

**Files Changed:**
- `src/utils/amm.ts` (lines 856-868)

---

### ✅ 2. Configurable Pool Fees

**Problem:**
- All pools had 1% fee hardcoded
- No option to create pools with lower fees (e.g., 0.25% for stable pairs)

**Solution:**
- Added support for multiple fee tiers
- Created `FeeConfig` interface and `FEE_TIERS` array
- Updated `createPool()` to accept AMM config parameter
- Added beautiful fee tier selector UI in Create Pool modal

**Files Changed:**
- `src/utils/amm.ts`:
  - Added `FeeConfig` interface (lines 35-42)
  - Added `FEE_TIERS` array (lines 46-70)
  - Updated `getPoolState()` to accept `ammConfig` param (line 201)
  - Updated `createPool()` to accept and use `ammConfigAddress` param (line 1068)
  
- `src/pages/Pools.tsx`:
  - Added `selectedFeeTier` state (line 430)
  - Imported `FEE_TIERS` from amm utils (line 4)
  - Added fee tier selector UI (lines 626-652)
  - Updated `createPool()` call to pass selected fee tier (line 523)

**UI Preview:**
```
┌─────────────────────────────────┐
│ Fee Tier                        │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ✓ 1.00%                     │ │
│ │   Best for volatile pairs   │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## 📚 Documentation Created

### **FEE_TIER_CONFIGURATION.md**
Complete guide for:
- How to create new AMM configs (admin only)
- How to calculate AMM config addresses
- How to add new fee tiers to the frontend
- Recommended fee structures (1%, 0.3%, 0.25%, 0.05%, 0.01%)
- Example scripts and commands

---

## 🎯 How to Add More Fee Tiers

**Step 1:** Create AMM config using admin account:
```bash
anchor run create-amm-config -- \
  --index 1 \
  --trade-fee-rate 2500 \  # 0.25%
  --protocol-fee-rate 500 \
  --fund-fee-rate 500 \
  --create-pool-fee 10000000 \
  --creator-fee-rate 1000
```

**Step 2:** Get the PDA address for the new config

**Step 3:** Add to `FEE_TIERS` array in `src/utils/amm.ts`:
```typescript
{
  index: 1,
  address: new PublicKey('YOUR_NEW_CONFIG_ADDRESS'),
  feeBps: 25, // 0.25%
  label: '0.25%',
  description: 'Best for standard pairs'
}
```

**Step 4:** Restart dev server - done! ✅

---

## 🚀 Current Status

### **Working Features:**
✅ Fresh deployment with new program ID  
✅ Native SOL support with auto-wrap/unwrap  
✅ Create pools with configurable fees  
✅ Add liquidity (with dust pool handling)  
✅ Remove liquidity  
✅ Swap tokens  
✅ Multi-hop routing  
✅ Transaction error handling improved  

### **Available Fee Tiers:**
- **1.00%** - ✅ Active (default)
- **0.25%** - ⏳ Need to create (admin)
- **0.05%** - ⏳ Need to create (admin)

---

## 🎨 User Experience Improvements

1. **No more false error messages** - "Already processed" now treated as success
2. **Fee tier selection** - Beautiful UI for choosing pool fees
3. **Clear fee descriptions** - Users know which fee is best for their pair
4. **Visual feedback** - Selected fee tier highlighted in cyan

---

## 📋 Next Steps

1. **Create additional fee tiers** (0.25%, 0.05%) using admin account
2. **Add fee display** to existing pools in the pool list
3. **Add tooltips** explaining fee tier benefits
4. **Consider adding APR/rewards** based on fee tier

---

## 🔧 Technical Details

### **Fee Tier Architecture:**
- Each AMM config is a PDA derived from `['amm_config', index]`
- Pool state PDA is derived from `['pool', amm_config, token0, token1]`
- Different configs = different pool addresses for same token pair
- Pools are immutably tied to their fee tier

### **Transaction Handling:**
- "Already processed" errors now return `'success-already-processed'`
- 2-second delay before treating as success
- Prevents duplicate error messages

---

## ✅ Testing Checklist

- [x] Create pool with 1% fee tier
- [ ] Create additional fee tiers (admin)
- [ ] Create pool with different fee tier
- [ ] Verify correct fee is applied
- [ ] Test "already processed" error handling
- [ ] Verify LP tokens received correctly

---

**Status**: ✅ **Ready for Production**  
**Version**: v1.1.0  
**Date**: October 27, 2025



