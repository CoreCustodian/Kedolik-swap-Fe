/**
 * Kedolik Stake Lock V1 frontend integration notes.
 */
export const KEDOLIK_DEVNET_README_NOTES = [
  'Kedolik Staking and Kedolik Locker now point at the combined Stake Lock V1 mainnet program.',
  'The legacy staking, mint-wrapper, and locking program IDs are no longer used by the frontend config.',
  'The mainnet admin config is live and the frontend reads adminConfig.authority from chain.',
  'The frontend is configured for the mainnet Stake Lock V1 deployment and classic SPL Token program.',
  'Locker recipient UI is constrained by the current V1 lock flow: createLock/unlock return tokens to the owner wallet, so third-party recipient claims require a contract change.',
] as const;
