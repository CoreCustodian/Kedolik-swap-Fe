/**
 * Kedolik devnet staking/locking integration notes
 *
 * Added files:
 * - src/config/kedolikDevnet.ts
 * - src/services/kedolikLocker.ts
 * - src/services/kedolikStaking.ts
 * - src/hooks/useKedolikStaking.ts
 * - src/hooks/useKedolikProgramStatus.ts
 * - src/hooks/useKedolikLocker.ts
 * - src/pages/KedolikLocker.tsx
 * - src/pages/KedolikStaking.tsx
 * - src/pages/KedolikFun.tsx
 * - src/pages/KedolikPad.tsx
 * - devnet-live-summary.json
 * - frontend-devnet-live.ts
 * - devnet-staking-live.json
 * - devnet-locker-live.json
 *
 * Program IDs:
 * - Configured in src/config/kedolikDevnet.ts
 *
 * Current live state:
 * - Kedolik Staking and Kedolik Locker are live on standard Solana devnet.
 * - A live test quarry and a live sample vesting escrow are configured in the frontend devnet files.
 *
 * Remaining caveat:
 * - Kedolik Staking writes are manually wired from the live devnet transaction layout because no staking IDL is checked in yet.
 */
export const KEDOLIK_DEVNET_README_NOTES = [
  'Program IDs are configured in src/config/kedolikDevnet.ts.',
  'Kedolik Staking and Kedolik Locker are live on devnet, with a live quarry and sample escrow configured.',
  'Locker write paths use locker.json against the live devnet locker program.',
  'Kedolik Staking reads and writes are wired against the live devnet pool, with first-stake miner creation handled in the frontend.',
  'A checked-in staking IDL is still recommended for long-term maintenance of the Kedolik staking client.',
] as const;
