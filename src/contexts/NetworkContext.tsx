/**
 * NetworkContext — app-wide online/offline state.
 *
 * Uses expo-network's addNetworkStateListener for push-based network change events. Provides:
 * - `isOnline`  — true when the device has validated internet access
 * - `isChecking` — true during the initial check
 *
 * Components can call `useNetwork()` to read state, or use the
 * `OfflineBanner` component for a standard "no internet" UI.
 */

import React, {
  createContext,
  use,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import * as Network from "expo-network";

interface NetworkContextValue {
  isOnline: boolean;
  isChecking: boolean;
  recheck: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  isChecking: false,
  recheck: async () => {},
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  const check = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
    } catch {
      setIsOnline(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    // Initial check
    void check();

    // Push-based subscription for network state transitions
    const subscription = Network.addNetworkStateListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
      setIsChecking(false);
    });

    return () => {
      subscription.remove();
    };
  }, [check]);

  const value = useMemo(
    () => ({ isOnline, isChecking, recheck: check }),
    [isOnline, isChecking, check]
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  return use(NetworkContext);
}

/**
 * useOnReconnect — fires `callback` exactly once each time the network
 * transitions from offline → online. Safe to call from any screen.
 */
export function useOnReconnect(callback: () => void): void {
  const { isOnline, isChecking } = useNetwork();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Track whether we've gone offline at least once this session
  const wasOfflineRef = useRef(false);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      if (!isOnline && !isChecking) {
        wasOfflineRef.current = true;
      }
      return;
    }

    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }

    // isOnline transitioned to true from offline
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      callbackRef.current();
    }
  }, [isOnline, isChecking]);
}
