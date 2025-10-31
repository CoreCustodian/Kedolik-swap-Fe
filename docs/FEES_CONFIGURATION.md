# 💰 Fee Configuration Documentation

## 📊 Overview

This document explains the fee structure for Kedolik Swap, which is based on Raydium's AMM fee model.

## 🎯 Fee Structure Summary

Based on the [Raydium Protocol Fees Documentation](https://docs.raydium.io/raydium/protocol/protocol-fees):


### **Standard AMM Pools (AMM v4)**
- **Trading Fee:** 0.25% per swap
- **Distribution:**
  - 0.22% (88%) → Liquidity Providers
  - 0.03% (12%) → Protocol (RAY buybacks)
  

### **CP-Swap (CPMM) Pools**
- **Available Tiers:** 0.25%, 1%, 2%, and 4%
- **Distribution:**
  - 84% → Liquidity Providers
  - 12% → Protocol buybacks
  - 4% → Treasury

### **Concentrated Liquidity (CLMM) Pools**
- **Available Tiers:** 0.01%, 0.02%, 0.03%, 0.04%, 0.05%, 0.25%, 1%, and 2%
- **Distribution:**
  - 84% → Liquidity Providers
  - 12% → Protocol buybacks
  - 4% → Treasury

## 🔧 Kedolik Swap Fee Tiers

Our implementation follows the **CP-Swap style** distribution:

| Tier | Trading Fee | Use Case | Index |
|------|-------------|----------|-------|
| **Tier 0** | 0.01% | Ultra-stable pairs (USDC/USDT) | 0 |
| **Tier 1** | 0.05% | Stable pairs | 1 |
| **Tier 2** | 0.25% | Standard AMM fee (most pairs) | 2 |
| **Tier 3** | 1.00% | Volatile pairs | 3 |

### **Fee Distribution (All Tiers)**
- **84%** → Liquidity Providers
- **12%** → Protocol (KEDOL buybacks/sustainability)
- **4%** → Treasury/Protocol Reserve

## 📝 Technical Details

### **Configuration Files**

#### 1. `src/config/fees.ts`
Defines the fee tiers available in the UI:
```typescript
export const FEE_TIER_CONFIGS: FeeConfig[] = [
  { index: 0, feeBps: 1, label: '0.01%', description: 'Best for ultra-stable pairs' },
  { index: 1, feeBps: 5, label: '0.05%', description: 'Best for stable pairs' },
  { index: 2, feeBps: 25, label: '0.25%', description: 'Standard fee - Best for most pairs' },
  { index: 3, feeBps: 100, label: '1.00%', description: 'Best for volatile pairs' }
];
```

#### 2. `scripts/init-amm-configs.ts`
Defines the on-chain AMM configs to be created by admin:
```typescript
const AMM_CONFIGS: AmmConfigParams[] = [
  {
    index: 0,
    tradeFeeRate: 1,        // 0.01%
    protocolFeeRate: 1200, // 12% of trade fee → protocol
    fundFeeRate: 400,       // 4% of trade fee → treasury
    createPoolFee: 10_000_000, // 0.01 SOL
    creatorFeeRate: 0       // 0% (no creator fees)
  },
  // ... other tiers
];
```

### **Fee Rate Calculation**

All rates are in **basis points** (BPS), where:
- 1 BPS = 0.01%
- 100 BPS = 1.00%
- 25 BPS = 0.25%

#### **Example: 0.25% Tier**
```
tradeFeeRate: 25           // 0.25% trading fee
protocolFeeRate: 1200      // 12% of 0.25% = 0.03%
fundFeeRate: 400           // 4% of 0.25% = 0.01%
creatorFeeRate: 0          // 0% (no creator fees)
```

Resulting distribution per $100 trade:
- Trading Fee: $0.25
- LPs get: $0.21 (84%)
- Protocol gets: $0.03 (12%)
- Treasury gets: $0.01 (4%)

## 🚀 Creating Fee Tiers On-Chain

### **Step 1: Initialize AMM Configs**

Run the initialization script:

```bash
# From project root
ts-node scripts/init-amm-configs.ts
```

This will create all AMM configs on-chain using your admin wallet.

### **Step 2: Verify on Blockchain**

Check that configs exist:
```bash
solana account <AMM_CONFIG_ADDRESS> --url devnet
```

### **Step 3: Users Can Now Create Pools**

Once configs exist, users can create pools and select fee tiers in the UI.

## 🔍 How It Works in Practice

### **For Pool Creators:**

1. Select tokens to pair (e.g., SOL/USDC)
2. Choose fee tier based on volatility:
   - **0.01%** → USDC/USDT
   - **0.05%** → USDC/DAI
   - **0.25%** → SOL/USDC (most common)
   - **1.00%** → Small cap altcoins
3. Pool is created with selected fee tier

### **For Traders:**

- Pay the trading fee on each swap
- Fees are distributed automatically:
  - 84% to liquidity providers
  - 12% to protocol sustainability
  - 4% to treasury

### **For Liquidity Providers:**

- Earn 84% of all trading fees from the pool
- Fees accumulate in the pool reserves
- Fees are paid out when you withdraw liquidity

## 📊 Fee Comparison

| Feature | Raydium AMM | Kedolik Swap |
|---------|-------------|--------------|
| Standard Fee | 0.25% | 0.25% |
| LP Portion | 88% (0.22%) | 84% (0.21%) |
| Protocol Portion | 12% (0.03%) | 12% (0.03%) |
| Treasury | 0% | 4% (0.01%) |
| Creator Fee | 0% | 0% |

## 🎯 Choosing the Right Fee Tier

### **When to use 0.01%:**
- USDC/USDT pairs
- Stablecoin-to-stablecoin swaps
- Minimal price impact expected

### **When to use 0.05%:**
- USDC/DAI pairs
- Stablecoin-to-semi-stable pairs
- Low volatility pairs

### **When to use 0.25% (Recommended):**
- SOL/USDC pairs
- Most token pairs
- Standard AMM trading
- **This is the default tier**

### **When to use 1.00%:**
- Small cap tokens
- High volatility pairs
- Illiquid markets
- Meme coins / new launches

## ⚠️ Important Notes

1. **Pool Creation Fee:** 0.01 SOL (prevents spam)
2. **Fee tiers must be created on-chain** before users can use them
3. **Fee distribution is automatic** - no manual intervention needed
4. **Creator fees are disabled** (0%) for simplicity
5. **Default tier is 0.25%** (Raydium standard)

## 📚 References

- [Raydium Protocol Fees](https://docs.raydium.io/raydium/protocol/the-ray-token/protocol-fees)
- [Raydium AMM Documentation](https://docs.raydium.io/raydium/protocol/amm)
- [Raydium CP-Swap Docs](https://docs.raydium.io/raydium/protocol/cp-swap)

