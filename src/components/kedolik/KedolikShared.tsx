import { ReactNode } from 'react';

export const formatKedolikAddress = (address: string) =>
  `${address.slice(0, 4)}...${address.slice(-4)}`;

export const formatKedolikUnixTime = (value: number) => {
  if (!value) {
    return 'Not set';
  }

  return new Date(value * 1000).toLocaleString();
};

export const formatKedolikTokenAmount = (value: string, decimals: number | null) => {
  if (decimals === null) {
    return value;
  }

  const negative = value.startsWith('-');
  const normalized = negative ? value.slice(1) : value;
  const padded = normalized.padStart(decimals + 1, '0');
  const whole = padded.slice(0, Math.max(1, padded.length - decimals));
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  const composed = fraction ? `${whole}.${fraction}` : whole;

  return negative ? `-${composed}` : composed;
};

export const KedolikProgramStatusBadge = ({
  live,
  executable,
}: {
  live: boolean;
  executable: boolean;
}) => {
  const className =
    live && executable
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      {live && executable ? 'Live on Mainnet' : 'Checking Mainnet'}
    </span>
  );
};

export const KedolikInfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
    <span className="text-sm text-gray-400">{label}</span>
    <span className="text-right text-sm font-medium text-white">{value}</span>
  </div>
);

export const KedolikPageFrame = ({ children }: { children: ReactNode }) => (
  <div className="relative min-h-screen overflow-hidden">
    <div className="fixed inset-0 bg-gradient-mesh opacity-25"></div>
    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px]"></div>

    <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">{children}</div>
  </div>
);
