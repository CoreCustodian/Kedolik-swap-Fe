# Raydium CP-Swap AMM Fee Distribution - Complete Explanation

## Overview
This document explains how the fee system works in the Raydium Constant Product (CP) Swap AMM that you've forked. 

## Fee Structure Components

### 1. **Trade Fee Rate** (`trade_fee_rate`)
This is the **TOTAL fee charged on every swap** (e.g., 1% or 10,000 in basis points where 1,000,000 = 100%).

The trade fee is denominated in **hundredths of a bip** (10^-6):
- 10,000 = 1% 
- 2,500 = 0.25%
- 1,000 = 0.1%

### 2. **Fee Distribution Rates**
The total trade fee is then split into THREE parts:

#### a) **Protocol Fee Rate** (`protocol_fee_rate`)
- Portion that goes to the protocol owner (admin)
- Example: If set to 120,000 (12%), then 12% of the trade fee goes to protocol

#### b) **Fund Fee Rate** (`fund_fee_rate`)
- Portion that goes to the platform fund
- Example: If set to 100,000 (10%), then 10% of the trade fee goes to fund

#### c) **Creator Fee Rate** (`creator_fee_rate`)
- Portion that goes to the pool creator
- Example: If set to 50,000 (5%), then 5% of the trade fee goes to the pool creator

#### d) **Liquidity Provider (LP) Fee**
- **The remainder after protocol, fund, and creator fees**
- This is NOT a separate rate - it's automatically calculated
- LPs get: 100% - protocol_fee_rate - fund_fee_rate - creator_fee_rate

## Example Calculation

Let's say you set up a pool with these parameters:
- **Trade Fee Rate**: 10,000 (1% of swap amount)
- **Protocol Fee Rate**: 120,000 (12% of trade fee)
- **Fund Fee Rate**: 100,000 (10% of trade fee)
- **Creator Fee Rate**: 50,000 (5% of trade fee)

### User swaps 100 SOL for USDC:

1. **Total Fee Charged**: 100 SOL × 1% = **1 SOL**

2. **Fee Distribution**:
   ```
   Protocol Fee:  1 SOL × 12% = 0.12 SOL  → Goes to protocol owner
   Fund Fee:      1 SOL × 10% = 0.10 SOL  → Goes to fund owner
   Creator Fee:   1 SOL × 5%  = 0.05 SOL  → Goes to pool creator
   LP Fee:        1 SOL × 73% = 0.73 SOL  → Stays in pool for LPs
   ```

3. **What Happens**:
   - **0.73 SOL** stays in the pool reserves (increases value for all LP token holders)
   - **0.12 SOL** accumulates in `protocol_fees_token_0` in the pool state
   - **0.10 SOL** accumulates in `fund_fees_token_0` in the pool state
   - **0.05 SOL** accumulates in `creator_fees_token_0` in the pool state

## How LPs Earn Their Fees

**Liquidity Providers earn automatically and proportionally:**

1. When a swap happens, the LP portion (73% in the example) stays in the pool
2. This increases the reserve amounts
3. When an LP removes liquidity, they get back:
   - Their proportional share of BOTH tokens in the pool
   - Which now includes the accumulated LP fees

**Example:**
- You add 10 SOL + 1000 USDC (1% of pool)
- Pool generates 100 SOL in LP fees over time
- Pool now has more reserves
- When you remove your liquidity, you get back more than you put in (your 1% share of the larger pool)

**No claiming needed for LPs** - fees automatically increase the value of LP tokens!

## How Protocol/Fund/Creator Claim Their Fees

These three parties must **actively claim** their accumulated fees:

### 1. **Protocol Owner Claims**
```rust
collect_protocol_fee()
```
- Only the protocol owner can call this
- Transfers accumulated `protocol_fees_token_0` and `protocol_fees_token_1` to owner's wallet
- Located in your code: `src/utils/amm.ts` (you'd need to implement this)

### 2. **Fund Owner Claims**
```rust
collect_fund_fee()
```
- Only the fund owner can call this
- Transfers accumulated `fund_fees_token_0` and `fund_fees_token_1` to fund owner's wallet

### 3. **Pool Creator Claims** ✅ (You've implemented this!)
```rust
collect_creator_fee()
```
- Only the pool creator can call this
- Transfers accumulated `creator_fees_token_0` and `creator_fees_token_1` to creator's wallet
- You can see this in action on your Pools page with the "Harvest" button

## Code Structure in Pool State

In the `PoolState` account, fees are tracked separately:

```rust
pub struct PoolState {
    // ... other fields
    
    // Accumulated fees waiting to be claimed
    pub protocol_fees_token_0: u64,
    pub protocol_fees_token_1: u64,
    pub fund_fees_token_0: u64,
    pub fund_fees_token_1: u64,
    pub creator_fees_token_0: u64,
    pub creator_fees_token_1: u64,
    
    // Actual pool reserves (includes LP fees)
    pub token_0_vault: Pubkey,  // holds all token0 (reserves + unclaimed fees)
    pub token_1_vault: Pubkey,  // holds all token1 (reserves + unclaimed fees)
}
```

## Default Configuration in Your Code

In your `src/utils/amm.ts`, the default initialization is:

```typescript
export const createAmmConfig = async (
  // ...
  params: {
    tradeFeeRate: number = 2500,        // 0.25% (Raydium standard)
    protocolFeeShareBps: number = 1200, // 12% of trade fee
    fundFeeShareBps: number = 1000,     // 10% of trade fee
    createPoolFeeLamports: number,
    creatorFeeShareBps: number = 500,   // 5% of trade fee
  }
)
```

This means:
- **0.25% total trading fee**
- **12%** of that (0.03% of trade) → Protocol
- **10%** of that (0.025% of trade) → Fund
- **5%** of that (0.0125% of trade) → Creator
- **73%** of that (0.1825% of trade) → LPs (stays in pool)

## Key Differences from Traditional AMMs

### Traditional AMM (like Uniswap V2):
- 0.3% fee, 100% goes to LPs
- No protocol fee, no fund fee, no creator fee

### Your Raydium Fork:
- Configurable total fee (e.g., 0.25%, 1%, etc.)
- Split between 4 parties: Protocol + Fund + Creator + LPs
- More sustainable for platform development
- Rewards pool creators

## Visual Flow

```
User Swaps 100 SOL
        ↓
Takes 1 SOL as fee (1%)
        ↓
    ┌───┴───┬───────┬─────────┐
    ↓       ↓       ↓         ↓
Protocol  Fund  Creator    LPs
(0.12)  (0.10)  (0.05)  (0.73)
    ↓       ↓       ↓         ↓
Claim   Claim   Claim    Auto-earned
 via     via     via    (increases
collect collect collect  LP token
Protocol Fund  Creator   value)
 Fee     Fee     Fee
```

## Important Notes

1. **All fees are in the same token as the swap input**
   - If user swaps SOL → USDC, fees are in SOL
   - If user swaps USDC → SOL, fees are in USDC

2. **Rates are stored in basis points × 100**
   - 1,000,000 = 100%
   - 10,000 = 1%
   - 2,500 = 0.25%

3. **LP fees compound automatically**
   - Every swap increases pool reserves
   - LP tokens become worth more
   - No need to claim

4. **Other fees must be claimed**
   - Protocol, Fund, and Creator fees accumulate
   - Must call respective collect functions
   - Fees stay in the pool vaults until claimed

5. **Creator Fee Mode**
   - Can be set to collect fees in token0 only, token1 only, or both
   - Controlled by `creator_fee_on` parameter

## Summary

**For a 1% trading fee:**
- User pays 1% of their swap amount
- That 1% is split between Protocol, Fund, Creator, and LPs
- LPs get their share automatically (it stays in the pool)
- Protocol, Fund, and Creator must claim their shares manually
- The exact percentages are configurable per AMM config

This model ensures:
- ✅ Sustainable protocol revenue
- ✅ Platform development fund
- ✅ Pool creator incentives
- ✅ Competitive LP rewards

