import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Friend, FriendProfileStats } from '../types';
import { AI_TRAINERS, AiTrainerConfig, getTrainerConfig, getTrainerStats, isAiTrainerId } from '../data/trainers';
import { useAuth } from './AuthContext';

// Keyed per-user, same pattern as the other local caches (avatar, XP,
// logged workouts) — so removing a trainer on one account never affects
// another account signed in on the same device.
const removedTrainersKey = (userId: string) => `gymbro_removed_trainers_${userId}`;

interface TrainersContextValue {
  // Every permanent trainer, active or removed — for the Manage Trainers
  // screen, which needs to list and restore removed ones.
  allTrainers: AiTrainerConfig[];
  // Only the trainers currently on the leaderboard, as Friend rows with
  // their live (simulated) XP already applied.
  visibleTrainers: Friend[];
  isTrainerId: (id: string) => boolean;
  isRemoved: (id: string) => boolean;
  removeTrainer: (id: string) => void;
  restoreTrainer: (id: string) => void;
  // Profile stats for a trainer's profile page — computed locally instead
  // of fetched, since trainers don't live on a backend.
  getTrainerProfileStats: (id: string) => FriendProfileStats | null;
}

const TrainersContext = createContext<TrainersContextValue | undefined>(undefined);

export function TrainersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [removedTrainerIds, setRemovedTrainerIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) {
      setRemovedTrainerIds([]);
      return;
    }
    AsyncStorage.getItem(removedTrainersKey(user.id))
      .then((stored) => {
        if (stored) setRemovedTrainerIds(JSON.parse(stored));
        else setRemovedTrainerIds([]);
      })
      .catch(() => {});
  }, [user]);

  const persist = useCallback(
    (ids: string[]) => {
      if (!user) return;
      AsyncStorage.setItem(removedTrainersKey(user.id), JSON.stringify(ids)).catch(() => {});
    },
    [user]
  );

  const removeTrainer = useCallback(
    (id: string) => {
      setRemovedTrainerIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const restoreTrainer = useCallback(
    (id: string) => {
      setRemovedTrainerIds((prev) => {
        if (!prev.includes(id)) return prev;
        const next = prev.filter((existing) => existing !== id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const isRemoved = useCallback((id: string) => removedTrainerIds.includes(id), [removedTrainerIds]);

  // Anchors the trainers' simulated XP to the same starting line as the
  // player — see getTrainerStats in data/trainers.ts. Falls back to "now"
  // if we don't know when the account was created (e.g. mid-migration),
  // which just means the trainers start from 0 today rather than
  // retroactively, same spirit as starting fresh.
  const trainerStartDate = useMemo(
    () => (user?.createdAt ? new Date(user.createdAt) : new Date()),
    [user?.createdAt]
  );

  const visibleTrainers = useMemo<Friend[]>(() => {
    return AI_TRAINERS.filter((t) => !removedTrainerIds.includes(t.id)).map((t) => {
      const { xp } = getTrainerStats(t, trainerStartDate);
      return {
        id: t.id,
        name: t.name,
        username: t.username,
        xp,
        lastActive: 'AI Trainer',
        initials: t.initials,
        color: t.color,
      };
    });
  }, [removedTrainerIds, trainerStartDate]);

  const getTrainerProfileStats = useCallback(
    (id: string): FriendProfileStats | null => {
      const config = getTrainerConfig(id);
      if (!config) return null;
      const { xp, dayStreak } = getTrainerStats(config, trainerStartDate);
      return { xp, dayStreak, streakWeek: [], splitName: null, splitDays: null };
    },
    [trainerStartDate]
  );

  const value: TrainersContextValue = {
    allTrainers: AI_TRAINERS,
    visibleTrainers,
    isTrainerId: isAiTrainerId,
    isRemoved,
    removeTrainer,
    restoreTrainer,
    getTrainerProfileStats,
  };

  return <TrainersContext.Provider value={value}>{children}</TrainersContext.Provider>;
}

export function useTrainers() {
  const ctx = useContext(TrainersContext);
  if (!ctx) {
    throw new Error('useTrainers must be used within a TrainersProvider');
  }
  return ctx;
}
