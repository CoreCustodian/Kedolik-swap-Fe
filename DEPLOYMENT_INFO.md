# Kedolik Swap - Deployment Information

**Network:** Solana Devnet  
**Deployed:** October 30, 2025

---

## 🔑 Key Addresses

### Program & Configuration

| Item | Address | Description |
|------|---------|-------------|
| **Program ID** | `2LdLPZbRokzmcJyFE7fLyTgMKNxuR9PE6PKfunn6fkUi` | Main AMM program |
| **AMM Config** | `6cYBQxes3T5CRStVgKNV4GiURNu2nCcUwmHwEWCcP4Zt` | Fee configuration account |
| **Protocol Token Config** | `7ZRkzDLJQkhYvoyKKJXHjk1qy1ArKtX8iqbNF7F4sETv` | KEDOLOG discount config |

### Token Addresses

| Token | Address | Type |
|-------|---------|------|
| **KEDOLOG** | `22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx` | Protocol Token (SPL) |
| **USDC** | `2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32` | Devnet USDC |
| **SOL/WSOL** | `So11111111111111111111111111111111111111112` | Native SOL |

### Fee Recipients

| Purpose | Address | Type |
|---------|---------|------|
| **Protocol Owner** | `JAaHqf4p14eNij84tygdF1nQkKV8MU3h7Pi4VCtDYiqa` | Admin wallet |
| **Pool Creation Fee** | `67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa` | Direct SOL recipient wallet |

⚠️ **Note:** The contract was upgraded to transfer SOL **directly** as native SOL (no WSOL wrapping)!

---

## 💰 Fee Structure

### Trading Fees

| Fee Type | Rate (BPS) | Percentage | Description |
|----------|------------|------------|-------------|
| **Trade Fee** | 2500 | 0.25% | Total swap fee |
| **LP Fee** | 2000 | 0.20% | Goes to liquidity providers |
| **Protocol Fee** | 500 | 0.05% | Goes to protocol treasury |

### Pool Creation

| Fee Type | Amount | Description |
|----------|--------|-------------|
| **Pool Creation Fee** | 0.15 SOL | One-time fee to create a new pool |

### KEDOLOG Discount

| Feature | Value | Description |
|---------|-------|-------------|
| **Discount Rate** | 2000 BPS (20%) | Discount on protocol fees when paying with KEDOLOG |
| **KEDOLOG per USD** | 10,000,000 | Conversion rate for fee calculation |

---

## 📜 Deployment Transactions

| Action | Transaction ID | Explorer Link |
|--------|---------------|---------------|
| **Program Deploy** | `27KXiKyCn...SRbmQ` | [View](https://explorer.solana.com/tx/27KXiKyCnEhNRJRf9qmcazhsZERFQRBChEpk9iQa6aXfKCSWU75mmUw8woj73XxGpuSbeH4BQ9bcVDqKWo4SRbmQ?cluster=devnet) |
| **AMM Config Init** | `3o36K6ND6...SJggyS` | [View](https://explorer.solana.com/tx/3o36K6ND62zrv4NjmapTckVQeeTDDpRUVXXLzNgKLcrneR99WVczE7cwnacCcLTwyAWhegKoXaStJNqxNwSJggyS?cluster=devnet) |
| **Protocol Config Init** | `4ATxeCpzc...b4QMPn` | [View](https://explorer.solana.com/tx/4ATxeCpzcFZvvo5S4bTdaTPz8KDgj6aPciTXUddDbyfGJQ9hrgTFJDCBEAjJbwGeCzSDhuqjPEvJjqNLaBb4QMPn?cluster=devnet) |
| **Program Upgrade** | `569bxr5Db...PPUu5q` | [View](https://explorer.solana.com/tx/569bxr5DbhG74HM7ds9SPFTruZic6h3iFLMj9dnnPXgUHUdgFVF8gDeWgRtnGZe22Xei57SktnvzSdUCr4PPUu5q?cluster=devnet) |
| **WSOL Account Create** | `2RSmnpSBn...e7bGPa` | [View](https://explorer.solana.com/tx/2RSmnpSBndcW7EVZTEMrAaPvFz1F41paLDgCwoW2AViYUdUUtX3m7P75uaBQGvURV4XCV1fr7x9z6iTdL3e7bGPa?cluster=devnet) |

---

## 🔧 Configuration Details

### Fee Distribution (0.25% total swap fee)

```
Total Trade Fee: 0.25%
├── Liquidity Providers: 0.20% (goes back to LP token holders)
└── Protocol: 0.05% (collected by protocol treasury)
```

### Pool Creation Fee Flow

```
User Creates Pool
    ↓
0.15 SOL deducted
    ↓
Directly transferred as native SOL
    ↓
Received by: 67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa
    ↓
Immediately available! ✅
```

**✅ Benefits of Direct SOL Transfer:**
- ✅ **Instant availability** - no unwrapping needed
- ✅ **No extra transactions** - saves gas fees
- ✅ **Simpler** - no WSOL account management
- ✅ **Lower fees** - one less operation

To check collected fees:
```bash
solana balance 67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa --url devnet
```

### KEDOLOG Discount Flow

When user opts to pay protocol fee with KEDOLOG:

```
Swap Transaction
    ↓
Calculate Protocol Fee (0.05% of input)
    ↓
Apply 20% discount
    ↓
Deduct KEDOLOG from user
    ↓
User receives more output tokens
```

**Discount Calculation:**
- Normal Protocol Fee: 0.05% (in input token)
- With KEDOLOG: 0.04% (20% discount)
- KEDOLOG Required: (0.05% * USD value) / 10,000,000

---

## 🎯 Quick Reference

### Frontend Configuration

Update these in your frontend (`src/config/fees.ts`):

```typescript
export const PROGRAM_ID = new PublicKey('2LdLPZbRokzmcJyFE7fLyTgMKNxuR9PE6PKfunn6fkUi');
export const AMM_CONFIG = new PublicKey('6cYBQxes3T5CRStVgKNV4GiURNu2nCcUwmHwEWCcP4Zt');

export const KEDOLOG_CONFIG = {
  MINT: new PublicKey('22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx'),
  AMM_CONFIG: new PublicKey('6cYBQxes3T5CRStVgKNV4GiURNu2nCcUwmHwEWCcP4Zt'),
  PROTOCOL_TOKEN_CONFIG: new PublicKey('7ZRkzDLJQkhYvoyKKJXHjk1qy1ArKtX8iqbNF7F4sETv'),
  POOL_CREATION_FEE_SOL: 0.15,
  DISCOUNT_RATE: 2000,
};
```

### Pool Creation Fee Account

```typescript
const createPoolFee = new PublicKey('FRX2thfNDB3MhHYHhcGZFiVK7NbuY2HzGn9WQDtAGBvX');
```

---

## ✅ Verification Commands

### Check AMM Config
```bash
solana account 6cYBQxes3T5CRStVgKNV4GiURNu2nCcUwmHwEWCcP4Zt --url devnet
```

### Check Protocol Token Config
```bash
solana account 7ZRkzDLJQkhYvoyKKJXHjk1qy1ArKtX8iqbNF7F4sETv --url devnet
```

### Check WSOL Fee Account
```bash
solana account FRX2thfNDB3MhHYHhcGZFiVK7NbuY2HzGn9WQDtAGBvX --url devnet
```

---

## 🔗 Useful Links

- **Program on Solana Explorer:** https://explorer.solana.com/address/2LdLPZbRokzmcJyFE7fLyTgMKNxuR9PE6PKfunn6fkUi?cluster=devnet
- **GitBook Documentation:** https://kedolik-swap.gitbook.io/kedolik-swap-docs/
- **Frontend:** (Add your deployed frontend URL here)

---

## 📝 Notes

1. **Pool Creation Fee:** The 0.15 SOL fee is properly configured and working. The WSOL account is correctly set up to receive wrapped SOL.

2. **KEDOLOG Discount:** The discount feature is live. Users can opt to pay protocol fees with KEDOLOG tokens to receive a 20% discount.

3. **Fee Distribution:** Trading fees are automatically distributed:
   - 0.20% stays in the pool for LP token holders
   - 0.05% is collected by the protocol treasury

4. **Contract Status:** The program has been upgraded and is functioning correctly with all features enabled.

---

**Last Updated:** October 31, 2025

