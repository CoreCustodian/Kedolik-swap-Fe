# ✅ Fee Tier Configuration Update

## 📊 Summary

Updated Kedolik Swap fee tiers to align with **Raydium's AMM fee structure** based on their official documentation.

## 🔄 Changes Made

### **1. Fee Tier Configuration (`src/config/fees.ts`)**

**Before:**
- Tier 0: 1.00%
- Tier 1: 0.30%
- Tier 2: 0.25%
- Tier 3: 0.05%
- Tier 4: 0.01%

**After (Raydium-aligned):**
- Tier 0: **0.01%** - Ultra-stable pairs
- Tier 1: **0.05%** - Stable pairs
- Tier 2: **0.25%** - Standard (Raydium's default)
- Tier 3: **1.00%** - Volatile pairs

### **2. Fee Distribution Updated**

**Before:**
- Protocol: 20% of trade fee
- Fund: 10% of trade fee
- Creator: 5% of trade fee

**After (Raydium CP-Swap style):**
- **Protocol**: 12% of trade fee (RAY buybacks equivalent)
- **Fund/Treasury**: 4% of trade fee
- **Creator**: 0% (disabled, following Raydium)
- **Liquidity Providers**: 84% of trade fee (automatically calculated)

### **3. AMM Config Script Updated (`scripts/init-amm-configs.ts`)**

Updated to use Raydium fee distribution:
```typescript
protocolFeeRate: 1200,  // 12% of trade fee
fundFeeRate: 400,        // 4% of trade fee  
creatorFeeRate: 0        // 0% (no creator fees)
```

### **4. Default AMM Config**

Changed from index 1 (0.30%) to **index 2 (0.25%)** - the Raydium standard fee.

## 📈 Fee Distribution Examples

### **0.25% Tier (Most Common)**
| Party | Fee | Percentage |
|-------|-----|------------|
| **Total Trading Fee** | 0.25% | 100% |
| Liquidity Providers | 0.21% | 84% |
| Protocol (KEDOL buybacks) | 0.03% | 12% |
| Treasury | 0.01% | 4% |
| Creator | 0% | 0% |

### **1.00% Tier (Volatile Pairs)**
| Party | Fee | Percentage |
|-------|-----|------------|
| **Total Trading Fee** | 1.00% | 100% |
| Liquidity Providers | 0.84% | 84% |
| Protocol (KEDOL buybacks) | 0.12% | 12% |
| Treasury | 0.04% | 4% |
| Creator | 0% | 0% |

## 🎯 Why These Changes?

1. **Aligns with Raydium standard** - Industry-proven fee structure
2. **Simpler for users** - Standard 0.25% fee for most pairs
3. **Better for LPs** - 84% of fees go to liquidity providers
4. **Protocol sustainability** - 12% to protocol for growth/buybacks
5. **Treasury funding** - 4% to treasury for operational costs

## 📋 Updated Files

1. ✅ `src/config/fees.ts` - Fee tier definitions
2. ✅ `scripts/init-amm-configs.ts` - On-chain config creation
3. ✅ `src/utils/amm.ts` - Default config index updated
4. ✅ `FEES_CONFIGURATION.md` - New documentation

## 🚀 Next Steps

1. **Re-initialize AMM configs** on-chain:
   ```bash
   npm run init-configs
   ```
   (Run from browser console with admin wallet connected)

2. **Users can now select fee tiers** when creating pools:
   - 0.01% - For USDC/USDT pairs
   - 0.05% - For stable pairs
   - 0.25% - Standard for most pairs ✅
   - 1.00% - For volatile pairs

3. **Verify fee distribution** in pools after initialization

## 📚 Reference

Based on: [Raydium Protocol Fees Documentation](https://docs.raydium.io/raydium/protocol/the-ray-token/protocol-fees)

