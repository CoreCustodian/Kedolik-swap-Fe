# Kedolik Swap Remote Configuration

This repository contains configuration files for Kedolik Swap that can be updated without redeploying the frontend.

## 📁 Files

### `tokens.json`

Contains the list of tokens displayed in the swap interface.

**Structure:**
```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-12-10T00:00:00.000Z",
  "tokens": [
    {
      "mint": "TOKEN_MINT_ADDRESS",
      "symbol": "SYMBOL",
      "name": "Token Name",
      "decimals": 9,
      "logoURI": "https://example.com/logo.png",
      "coingeckoId": "coingecko-id",
      "enabled": true
    }
  ]
}
```

**Fields:**
- `mint` (required): The Solana mint address of the token
- `symbol` (required): Token symbol (e.g., "SOL", "USDC")
- `name` (required): Full token name
- `decimals` (required): Token decimals (usually 9 for SPL tokens, 6 for USDC/USDT)
- `logoURI` (optional): URL to the token logo image
- `coingeckoId` (optional): CoinGecko ID for price fetching
- `enabled` (optional, default: true): Set to `false` to hide the token

**To add a new token:**
1. Edit `tokens.json`
2. Add a new object to the `tokens` array
3. Update the `version` and `lastUpdated` fields
4. Commit and push

**To disable a token:**
Set `"enabled": false` for that token (don't delete it, in case you want to re-enable later).

---

### `features.json`

Controls feature toggles for the entire platform.

**Structure:**
```json
{
  "swapEnabled": true,
  "poolsEnabled": true,
  "liquidityEnabled": true,
  "maintenanceMode": false,
  "maintenanceMessage": "We're upgrading! Back soon.",
  "announcementBanner": {
    "enabled": false,
    "message": "Your announcement here",
    "type": "info"
  }
}
```

**Fields:**
- `swapEnabled`: Enable/disable the swap feature
- `poolsEnabled`: Enable/disable the pools page
- `liquidityEnabled`: Enable/disable liquidity operations
- `maintenanceMode`: When `true`, shows maintenance page
- `maintenanceMessage`: Message shown during maintenance
- `announcementBanner`: Show a banner at the top of the site
  - `enabled`: Show/hide the banner
  - `message`: Banner text
  - `type`: `"info"` | `"warning"` | `"error"` | `"success"`

---

## 🚀 Quick Actions

### Disable Swaps (Emergency)
```json
{
  "swapEnabled": false,
  ...
}
```

### Enable Maintenance Mode
```json
{
  "maintenanceMode": true,
  "maintenanceMessage": "Scheduled maintenance in progress. Back in 30 minutes!",
  ...
}
```

### Show Announcement Banner
```json
{
  "announcementBanner": {
    "enabled": true,
    "message": "🎉 New tokens added! Check out the latest pairs.",
    "type": "success"
  },
  ...
}
```

---

## ⚠️ Important Notes

1. **Cache Duration**: Changes take up to 5 minutes to reflect on the frontend (cached for performance)
2. **JSON Validation**: Make sure your JSON is valid before pushing (use a JSON validator)
3. **Backup**: Always keep a backup of working configurations
4. **Testing**: Test changes on a staging environment if possible

---

## 📂 Repository Structure

```
KedolikSwap/config/
├── README.md
├── tokens.json      # Token list
├── features.json    # Feature flags
└── logos/           # Token logos (optional)
    ├── kedol.png
    └── ...
```

