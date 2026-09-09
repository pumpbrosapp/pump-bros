import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

interface UserContextValue {
  avatarUri: string | null;
  setAvatarUri: (uri: string | null) => void;
  displayName: string | null;
  setDisplayName: (name: string) => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

// Without this, a picked avatar only ever lived in React state — it looked
// like it "took" in the moment, but reopening the app (or even just the
// JS context reloading) silently dropped it back to the initials
// placeholder. Persisting it locally, keyed per account, means it sticks
// around, and it's what lets the leaderboard row for "me" keep showing the
// real picture instead of falling back.
const avatarStorageKey = (userId: string) => `gymbro_avatar_uri_${userId}`;

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [avatarUri, setAvatarUriState] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAvatarUriState(null);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(avatarStorageKey(user.id))
      .then((stored) => {
        if (cancelled) return;
        // Nothing cached on this device yet — fall back to whatever's on
        // the account already (set from another device, or from before a
        // reinstall) rather than showing the placeholder until the next
        // upload.
        setAvatarUriState(stored ?? user.avatarUrl);
      })
      .catch(() => {
        if (!cancelled) setAvatarUriState(user.avatarUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setAvatarUri = (uri: string | null) => {
    setAvatarUriState(uri);
    if (!user) return;
    if (uri) {
      AsyncStorage.setItem(avatarStorageKey(user.id), uri).catch(() => {});
    } else {
      AsyncStorage.removeItem(avatarStorageKey(user.id)).catch(() => {});
    }
  };

  const value = useMemo(
    () => ({ avatarUri, setAvatarUri, displayName, setDisplayName }),
    [avatarUri, displayName, user]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return ctx;
}
