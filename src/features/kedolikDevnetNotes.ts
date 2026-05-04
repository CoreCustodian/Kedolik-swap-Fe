/**
 * Kedolik Stake Lock V1 frontend integration notes.
 */
export const KEDOLIK_DEVNET_README_NOTES = [
  'Kedolik Staking and Kedolik Locker now point at the combined Stake Lock V1 devnet program.',
  'The legacy staking, mint-wrapper, and locking program IDs are no longer used by the frontend config.',
  'The devnet admin config is live, but no staking pool instance exists yet.',
  'The local Stake Lock V1 IDL file is not present in this frontend repo and the deployed program has no on-chain Anchor IDL published.',
  'Locker recipient UI is constrained by the current V1 lock flow: createLock/unlock return tokens to the owner wallet, so third-party recipient claims require a contract change.',
] as const;
