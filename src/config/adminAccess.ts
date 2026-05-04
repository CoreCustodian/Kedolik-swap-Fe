export const ADDITIONAL_ADMIN_WALLETS = [
  'Bb87v4Qz7n5NEPdi6nBFbuTb6FZRrAc5he7cL1kaYZ2C',
] as const;

export const isAdditionalAdminWallet = (address?: string | null) =>
  Boolean(address && ADDITIONAL_ADMIN_WALLETS.includes(address as typeof ADDITIONAL_ADMIN_WALLETS[number]));
