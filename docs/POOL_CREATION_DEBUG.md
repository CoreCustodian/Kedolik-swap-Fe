# Pool Creation Error Debug

## Current Issue: SyncNative IncorrectProgramId

The contract is trying to call `SyncNative` on a token account that's not a WSOL account.

## What's Happening:

1. User tries to create KEDOLOG/USDC pool
2. Neither token is SOL
3. Contract receives initialize instruction
4. Contract internally calls `SyncNative` 
5. Fails with `IncorrectProgramId`

## Possible Causes:

### 1. Contract Bug
The contract might have a bug where it incorrectly identifies non-SOL tokens as SOL.

### 2. Wrong Account Passed
We might be passing the wrong account address to the contract (e.g., a WSOL ATA instead of the actual token ATA).

### 3. Existing WSOL Account
The user might have an existing WSOL account at the same address (shouldn't happen with correct program ID).

## Debug Steps:

### Check Token Addresses:
```
KEDOLOG: 22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx
USDC: 2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32  
SOL/WSOL: So11111111111111111111111111111111111111112
```

### Check Token Programs:
Both should be: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`

## Solution Attempt:

Added explicit token program parameters to:
1. `getAssociatedTokenAddress()` calls
2. `createAssociatedTokenAccountInstruction()` calls

This ensures we're calculating and creating ATAs with the correct program ID.

## If Still Failing:

The issue might be **in the smart contract itself**. The contract might be:
1. Checking if mint equals NATIVE_MINT incorrectly
2. Having a bug in its SOL detection logic
3. Needing a contract upgrade to fix the issue

## Workaround:

Try creating a pool with **SOL** as one of the tokens first to verify the contract works. Then investigate why non-SOL tokens trigger the SyncNative call.

---

**Next Steps:** Test pool creation again with the updated code. If it still fails, we may need to examine the contract code itself or contact the contract developer.

