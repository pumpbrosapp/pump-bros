import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { SplitDayValue, SplitPreset, WEEK_DAYS } from '../data/splits';

function emptyDays(): SplitDayValue[] {
  return WEEK_DAYS.map(({ day, fullDay }) => ({ day, fullDay, label: null }));
}

interface SplitContextValue {
  splitName: string | null; // e.g. "Push Pull Legs" or "Custom" once edited manually
  days: SplitDayValue[];
  hasSplit: boolean; // true once the user has set at least one day
  setDayLabel: (index: number, label: string | null) => void;
  applyPreset: (preset: SplitPreset) => void;
  resetSplit: () => void;
  // Bulk-sets name + days without going through the manual-edit/preset
  // semantics above. Used to hydrate from a synced source (Supabase) on
  // sign-in, where we want to load exactly what was saved rather than
  // running it through "this counts as a manual edit now" logic.
  restoreSplit: (splitName: string | null, days: SplitDayValue[]) => void;
}

const SplitContext = createContext<SplitContextValue | undefined>(undefined);

export function SplitProvider({ children }: { children: React.ReactNode }) {
  const [days, setDays] = useState<SplitDayValue[]>(emptyDays());
  const [splitName, setSplitName] = useState<string | null>(null);

  const setDayLabel = useCallback((index: number, label: string | null) => {
    setDays((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], label };
      return next;
    });
    // Any manual edit detaches from a named preset unless it's still empty.
    setSplitName((prev) => (prev ? 'Custom' : prev));
  }, []);

  const applyPreset = useCallback((preset: SplitPreset) => {
    setDays(
      WEEK_DAYS.map(({ day, fullDay }, i) => ({
        day,
        fullDay,
        label: preset.pattern[i] ?? null,
      }))
    );
    setSplitName(preset.name);
  }, []);

  const resetSplit = useCallback(() => {
    setDays(emptyDays());
    setSplitName(null);
  }, []);

  const restoreSplit = useCallback((name: string | null, restoredDays: SplitDayValue[]) => {
    setSplitName(name);
    setDays(restoredDays);
  }, []);

  const hasSplit = useMemo(() => days.some((d) => d.label), [days]);

  const value = useMemo(
    () => ({ splitName, days, hasSplit, setDayLabel, applyPreset, resetSplit, restoreSplit }),
    [splitName, days, hasSplit, setDayLabel, applyPreset, resetSplit, restoreSplit]
  );

  return <SplitContext.Provider value={value}>{children}</SplitContext.Provider>;
}

export function useSplit() {
  const ctx = useContext(SplitContext);
  if (!ctx) {
    throw new Error('useSplit must be used within a SplitProvider');
  }
  return ctx;
}
