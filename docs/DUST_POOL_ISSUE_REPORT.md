# Dust Pool Issue - Kedolik AMM Program

## ✅ STATUS: RESOLVED
**The program has been upgraded and the bug is fixed!**
- Program redeployed: ✅
- Dust pools now work correctly: ✅
- Frontend updated: ✅

---

## Problem Summary (Historical)
The Kedolik AMM program HAD a critical edge case bug that prevented liquidity deposits to pools with **reserves > 0 but LP supply = 0** (dust pools). This created permanently "stuck" pools that could not accept new liquidity.

**This issue has been resolved in the upgraded program.**

## Technical Details

### Pool State (Stuck)
```
Pool Address: EmRuZ223bXKBfDGW6E8LhKRgFojsucL4it2inccSo42R
LP Mint: AreHgkroWDmNCwwZPciZkSmjrnEULq3Ky1KswbQX8HKM

Token 0 (USDC): 2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32
Token 1 (WSOL): 6xuEzd4YE3XRXWdSRKZ6V2LELkR6tocvPcnu18E8rwjv

Reserve 0: 0.000587 USDC (587 base units)
Reserve 1: 0.000002408 WSOL (2,408 base units)
LP Supply: 0 (ZERO!)
```

### How This Happened
1. User removed ALL liquidity from the pool
2. Tiny dust amounts remained in vaults due to rounding/precision
3. LP supply became 0, but reserves > 0
4. Pool is now in an inconsistent state

### The Bug

**Deposit Instruction Failing:**
```
Error: ExceededSlippage (0x1775)
Error Number: 6005
Message: Exceeds desired slippage limit
```

**Attempted Solutions (ALL FAILED):**
- ✅ Exact ratio matching (1:1 with existing reserves)
- ✅ 50% slippage buffer
- ✅ 100% slippage buffer  
- ✅ 200% slippage buffer
- ✅ 500% slippage buffer
- ❌ **STILL FAILS**

**Test Deposit:**
```
Deposit: 1500 USDC + 6.153322 WSOL
Ratio: 0.00410221 (matches pool exactly)
Max allowed: 9,000 USDC + 36.9 WSOL (600% of deposit!)
Result: ExceededSlippage error
```

### Root Cause Analysis

The program's `deposit` instruction has inconsistent validation logic:

1. **When LP supply = 0** → Program expects initial deposit (geometric mean LP calculation)
2. **When reserves > 0** → Program expects subsequent deposit (ratio-based LP calculation)
3. **When BOTH conditions exist** → Mathematical/validation conflict!

The slippage check fails because:
- Program calculates expected amounts based on reserves
- But validates LP tokens as if it's initial deposit
- Creates impossible-to-satisfy constraints

## Transaction Logs

```
Program log: Instruction: Deposit
Program data: eaPNyTnadTzMiaWjY4FY5k9SOCa3nR3xvmAA52MI0iEODCvHexmwnmQAAAAAAAAALAAAAAAAAADpAAAAAAAAAJQFnNcJAAAAzTR6HjQAAAAAAAAAAAAAAAAAAAAAAAAAAA==
Program log: AnchorError occurred. Error Code: ExceededSlippage. Error Number: 6005. Error Message: Exceeds desired slippage limit.
Program F3mHkHDh3A61A3mp9dd35DzhypacRRKeEKYDNh4dQqRc consumed 18961 of 199700 compute units
Program F3mHkHDh3A61A3mp9dd35DzhypacRRKeEKYDNh4dQqRc failed: custom program error: 0x1775
```

## Impact

**User Experience:**
- Pools become permanently stuck
- Cannot add liquidity
- Cannot swap (insufficient liquidity)
- Cannot create new pool (same token pair = same PDA = blocked)

**Frequency:**
- Occurs whenever user removes all liquidity
- High probability due to precision/rounding
- Will affect many users over time

---

## AI DEVELOPER PROMPT

Use this prompt to get help fixing the smart contract:

```
I'm working on a Solana AMM program (Anchor framework) and discovered a critical bug in the liquidity deposit logic. The program enters an invalid state when users remove all liquidity, leaving dust amounts in reserves but setting LP supply to 0.

CURRENT BEHAVIOR:
- Pool state: reserves > 0 (tiny dust), LP supply = 0
- Deposit instruction fails with ExceededSlippage error (0x1775)
- Tested with up to 500% slippage buffer - still fails
- Pool becomes permanently stuck and unusable

EXPECTED BEHAVIOR:
- Should allow deposits to pools with dust reserves
- OR should prevent reserves from reaching dust state
- OR should provide admin function to clear dust

PROGRAM STRUCTURE (Anchor):

The deposit instruction has this validation:
```rust
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub pool_state: Account<'info, PoolState>,
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,
    // ... other accounts
}

pub fn deposit(
    ctx: Context<Deposit>,
    amount_0: u64,
    amount_1: u64,
    lp_amount: u64,
    max_amount_0: u64,
    max_amount_1: u64,
) -> Result<()> {
    // Slippage validation fails here for dust pools
    require!(
        actual_amount_0 <= max_amount_0,
        ErrorCode::ExceededSlippage
    );
    require!(
        actual_amount_1 <= max_amount_1,
        ErrorCode::ExceededSlippage
    );
    // ...
}
```

QUESTIONS:

1. How should the deposit instruction handle pools with reserves > 0 but LP supply = 0?

2. Should we add a minimum reserve threshold to prevent dust state? Example:
   ```rust
   const MIN_RESERVE: u64 = 1000; // Prevent dust below this amount
   
   pub fn withdraw(ctx: Context<Withdraw>, ...) -> Result<()> {
       let remaining_0 = vault_0.amount - amount_0;
       let remaining_1 = vault_1.amount - amount_1;
       
       // Force complete withdrawal if going below minimum
       if remaining_0 < MIN_RESERVE || remaining_1 < MIN_RESERVE {
           // Withdraw everything, close pool
       }
   }
   ```

3. Should we add a "clear_dust" admin instruction? Example:
   ```rust
   pub fn clear_dust(ctx: Context<ClearDust>) -> Result<()> {
       require!(
           ctx.accounts.pool_state.lp_supply == 0,
           ErrorCode::PoolNotEmpty
       );
       
       // Transfer dust to fee recipient
       // Reset pool state
   }
   ```

4. How to fix the slippage validation to handle this edge case? Should we:
   - Treat reserves < threshold as 0 (ignore dust)?
   - Use different validation logic when LP supply = 0?
   - Add special handling for "dust pool recovery"?

5. What's the correct LP token calculation when LP supply = 0 but reserves > 0?
   - Geometric mean (initial deposit formula)?
   - Ratio-based on existing reserves?
   - Burn dust first, then calculate?

ADDITIONAL CONTEXT:

This is a constant product AMM (x * y = k formula). The pool uses:
- SPL Token Program for vault management
- Anchor's Account and PDA system
- Standard AMM math (geometric mean for initial, ratio for subsequent)

The bug occurs because:
1. User calls withdraw with all LP tokens
2. Due to rounding, tiny amounts remain in vaults
3. LP supply becomes 0, but vault.amount > 0
4. Future deposits calculate LP incorrectly
5. Slippage check fails no matter the tolerance

GOAL:
Provide a complete solution (code changes) to prevent or fix dust pools. The solution should be backwards compatible and not break existing pools.
```

---

## Recommended Solutions

### Solution 1: Minimum Reserve Threshold (Prevention)
```rust
pub fn withdraw(ctx: Context<Withdraw>, lp_amount: u64) -> Result<()> {
    const DUST_THRESHOLD: u64 = 1000; // Minimum reserve
    
    let remaining_lp = ctx.accounts.lp_mint.supply - lp_amount;
    
    if remaining_lp < DUST_THRESHOLD {
        // Force complete withdrawal
        // Burn all remaining LP
        // Transfer all remaining reserves
        // Set reserves to 0
    }
    
    // ... rest of logic
}
```

### Solution 2: Dust Clearing Function (Remediation)
```rust
pub fn clear_dust(ctx: Context<ClearDust>) -> Result<()> {
    require!(
        ctx.accounts.pool_state.lp_supply == 0,
        ErrorCode::PoolNotEmpty
    );
    
    // Transfer all dust to protocol fee recipient
    // Reset reserves to 0
    
    Ok(())
}
```

### Solution 3: Smart Deposit Logic (Handling)
```rust
pub fn deposit(ctx: Context<Deposit>, ...) -> Result<()> {
    const DUST_THRESHOLD: u64 = 1000;
    
    let reserve_0 = ctx.accounts.vault_0.amount;
    let reserve_1 = ctx.accounts.vault_1.amount;
    let lp_supply = ctx.accounts.lp_mint.supply;
    
    // Treat dust as zero
    let effective_reserve_0 = if reserve_0 < DUST_THRESHOLD { 0 } else { reserve_0 };
    let effective_reserve_1 = if reserve_1 < DUST_THRESHOLD { 0 } else { reserve_1 };
    
    // Use initial deposit logic if effective reserves are 0
    if effective_reserve_0 == 0 || effective_reserve_1 == 0 || lp_supply == 0 {
        // Initial deposit (geometric mean)
    } else {
        // Subsequent deposit (ratio-based)
    }
    
    // ... rest of logic
}
```

## Testing Recommendations

1. **Unit tests for dust state:**
   - Test withdraw that leaves < DUST_THRESHOLD
   - Test deposit to pool with dust reserves
   - Test LP calculation with dust

2. **Integration tests:**
   - Remove all liquidity
   - Verify no dust remains OR dust is properly handled
   - Add liquidity to "recovered" pool

3. **Upgrade path:**
   - Migration script to clear existing dust pools
   - Backwards compatible changes

## Priority: CRITICAL

This bug creates permanently stuck pools and blocks users from creating new pools with the same token pairs. Should be fixed in next program upgrade.

---

## Contact
- Pool Address: `EmRuZ223bXKBfDGW6E8LhKRgFojsucL4it2inccSo42R`
- LP Mint: `AreHgkroWDmNCwwZPciZkSmjrnEULq3Ky1KswbQX8HKM`
- Network: Devnet
- Program: `F3mHkHDh3A61A3mp9dd35DzhypacRRKeEKYDNh4dQqRc`

