# How to Collect Pool Creation Fees

When users create pools, they pay a **0.15 SOL fee**. This fee is **directly transferred as native SOL** to the fee receiver wallet.

## 🎉 Contract Upgraded - Direct SOL Transfer!

**Great news!** The contract has been upgraded to transfer SOL **directly** instead of wrapping to WSOL. This means:
- ✅ Fees appear **immediately** in your wallet
- ✅ **No unwrapping** needed
- ✅ **No extra transactions** or gas fees
- ✅ **Simpler** fee collection


---

## 📍 Where Are the Fees?

The fees go **directly** to your wallet as **native SOL**:

- **Fee Receiver Wallet:** `67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa`

**That's it!** The fees appear in your regular SOL balance immediately after each pool creation.

---

## 💰 How to Check Your Fees

It's super simple now! Just check your wallet balance:

### Using Solana CLI

```bash
solana balance 67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa --url devnet
```

### Using Solana Explorer

Visit this link:
https://explorer.solana.com/address/67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa?cluster=devnet

You should see the regular SOL balance. **Each pool created = +0.15 SOL!**

### Using Phantom/Solflare Wallet

If you have the wallet connected:
1. Open your wallet
2. Check the SOL balance
3. That's it! The fees are already there.

---

## 🔄 Understanding the New Process

### How Direct SOL Transfer Works

With the upgraded contract, the process is much simpler:

1. **User creates pool** → 0.15 SOL deducted from user's wallet
2. **Contract transfers SOL** → Directly to fee receiver wallet
3. **Done!** → SOL immediately available ✅

### Pool Creation Fee Flow

```
User Wallet
    ↓ (0.15 SOL)
Directly transferred
    ↓
Fee Receiver Wallet: 67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa
    ↓
Immediately available! ✅
```

---

## 📋 Quick Reference

### Check SOL Balance
```bash
solana balance 67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa --url devnet
```

### View on Explorer
https://explorer.solana.com/address/67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa?cluster=devnet

### Calculate Expected Fees
```
Number of pools created × 0.15 SOL = Total fees collected
```

---

## 🔐 Security Notes

1. **Keep your keypair secure!** The keypair for `67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa` controls the wallet's SOL balance.

2. **Never share your keypair** with anyone or store it in publicly accessible locations.

3. **Regular backups** - Make sure you have secure backups of your keypair in case of hardware failure.

---

## ❓ FAQ

**Q: Why don't I see the 0.15 SOL in my wallet balance?**
A: You should see it immediately! The contract now transfers SOL directly. Check your wallet balance using the commands above.

**Q: How do I collect the fees?**
A: You don't need to do anything! The fees appear in your wallet automatically as soon as a pool is created.

**Q: Do I need to run any scripts?**
A: No! The old WSOL unwrap script is no longer needed. Fees go directly to your wallet.

**Q: When can I spend the collected fees?**
A: Immediately! They're regular SOL in your wallet, available for any use.

**Q: How many pools have been created?**
A: Divide your total collected fees by 0.15 to get the number of pools. Or check your protocol's pool list.

**Q: Can I change the fee amount?**
A: Yes, if you're the protocol owner, you can update the AMM config on-chain using the `updateAmmConfig` instruction.

---

## 🎯 Summary

1. ✅ **Fees are collected automatically** - Direct SOL transfer to your wallet
2. ✅ **Check balance anytime** - Use Solana Explorer or CLI
3. ✅ **No scripts needed** - Completely automatic
4. ✅ **Immediately available** - Use the SOL right away

**The 0.15 SOL per pool creation goes directly to your wallet! 🎉**

