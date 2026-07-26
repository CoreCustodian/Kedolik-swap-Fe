import { useState, useEffect, useCallback } from 'react';
import { 
  fetchFeatureFlags, 
  FeatureFlags, 
  DEFAULT_FEATURE_FLAGS,
  clearRemoteConfigCache 
} from '../config/remoteConfig';

/**
 * React hook for accessing feature flags
 * 
 * Features can be toggled remotely via GitHub without code changes.
 * 
 * Usage:
 * ```tsx
 * const { flags, isLoading, refresh } = useFeatureFlags();
 * 
 * if (!flags.swapEnabled) {
 *   return <div>Swap is currently disabled</div>;
 * }
 * ```
 */
export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFlags = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        clearRemoteConfigCache();
      }
      
      const fetchedFlags = await fetchFeatureFlags();
      setFlags(fetchedFlags);
      console.log('🎛️ Feature flags loaded:', { swapEnabled: fetchedFlags.swapEnabled, poolsEnabled: fetchedFlags.poolsEnabled });
    } catch (err) {
      console.error('Error loading feature flags:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Keep using default/cached flags on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();

    // Refresh periodically without busting cache every time (avoids console spam / re-renders)
    const interval = setInterval(() => {
      loadFlags(false);
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [loadFlags]);

  const refresh = useCallback(() => loadFlags(true), [loadFlags]);

  return {
    flags,
    isLoading,
    error,
    refresh,
    // Convenience accessors
    swapEnabled: flags.swapEnabled,
    poolsEnabled: flags.poolsEnabled,
    liquidityEnabled: flags.liquidityEnabled,
    maintenanceMode: flags.maintenanceMode,
    kedolikDevnetEnabled: flags.kedolikDevnetEnabled ?? DEFAULT_FEATURE_FLAGS.kedolikDevnetEnabled,
    maintenanceMessage: flags.maintenanceMessage,
    announcementBanner: flags.announcementBanner,
  };
}

export default useFeatureFlags;

