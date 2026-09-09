import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { useWorkout, XP_PER_WORKOUT, COMEBACK_BONUS_XP } from '../context/WorkoutContext';
import { bucketForType } from '../data/workout';
import { colors, radius, shadow, type } from '../theme';
import { WorkoutType } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const AUTO_CLOSE_DELAY = 2200;
const TRACK_HEIGHT = 60;
const THUMB_SIZE = 52;
const TRACK_PADDING = 4;
const COMPLETE_THRESHOLD = 0.94;
const HAPTIC_STEPS = 12; // number of tick points across the drag distance

// Confetti burst geometry — computed once so the piece layout is stable
// across re-renders but still feels hand-scattered.
const CONFETTI_COLORS = ['#34A853', '#FF8A3D', '#F4B400', '#4C8BF5'];
const CONFETTI_COUNT = 16;
const confettiPieces = Array.from({ length: CONFETTI_COUNT }).map((_, i) => {
  const angle = (Math.PI * 2 * i) / CONFETTI_COUNT + ((i % 3) - 1) * 0.18;
  const distance = 58 + ((i * 37) % 46);
  return {
    id: i,
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance - 14,
    rotate: ((i * 53) % 240) - 120,
    size: 5 + ((i * 7) % 5),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    isBar: i % 3 === 0,
  };
});

// expo-haptics isn't supported on web; guard every call so this still
// runs fine there without throwing.
function tickHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function successHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

const TYPE_OPTIONS: { value: WorkoutType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'strength', label: 'Strength', icon: 'barbell' },
  { value: 'cardio', label: 'Cardio', icon: 'heart' },
];

// Only Strength and Cardio are pickable now — a value ever loaded from
// old data still carries 'other' as a possibility (see WorkoutType), so
// this maps that legacy value onto the pill that shares its bucket
// ('workout', same as strength) instead of leaving no pill selected.
function toPillType(type: WorkoutType): 'strength' | 'cardio' {
  return type === 'cardio' ? 'cardio' : 'strength';
}

interface TypePillsProps {
  value: WorkoutType;
  onChange: (type: WorkoutType) => void;
  // Buckets already logged today — a pill whose bucket is done still
  // shows (and can still be tapped to preview), it just can't be slid,
  // since a checkmark next to it already communicates that.
  todayWorkoutLogged: boolean;
  todayCardioLogged: boolean;
}

// Sits right above the slide-to-log bar. Pre-selected to whatever was
// picked last time (or steered toward whichever bucket isn't done yet),
// so on a normal day this costs zero extra taps — just slide as usual.
// Only tapping a different pill adds a step.
function TypePills({ value, onChange, todayWorkoutLogged, todayCardioLogged }: TypePillsProps) {
  return (
    <View style={styles.typePillRow}>
      {TYPE_OPTIONS.map((option) => {
        const active = option.value === toPillType(value);
        const bucketDone = bucketForType(option.value) === 'cardio' ? todayCardioLogged : todayWorkoutLogged;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.typePill, active && styles.typePillActive]}
            activeOpacity={0.85}
            hapticStyle="light"
            onPress={() => onChange(option.value)}
          >
            <Ionicons
              name={bucketDone ? 'checkmark' : option.icon}
              size={14}
              color={active ? colors.iconOnDark : bucketDone ? colors.textTertiary : colors.textSecondary}
            />
            <Text
              style={[
                styles.typePillText,
                active && styles.typePillTextActive,
                bucketDone && !active && styles.typePillTextDone,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface SlideToLogProps {
  onComplete: () => void;
  disabled?: boolean;
}

function SlideToLog({ onComplete, disabled }: SlideToLogProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const pan = useRef(new Animated.Value(0)).current;
  const chevronPulse = useRef(new Animated.Value(0)).current;
  const completedRef = useRef(false);
  const lastHapticStepRef = useRef(0);
  const maxDrag = Math.max(trackWidth - THUMB_SIZE - TRACK_PADDING * 2, 1);

  // PanResponder is created once (below) via useRef, so its callbacks close
  // over whatever `maxDrag`/`disabled` were on that first render — before
  // onLayout has even measured the track. Keep the live values in refs so
  // the gesture handlers always read the current numbers instead of a
  // frozen snapshot from mount time.
  const maxDragRef = useRef(maxDrag);
  maxDragRef.current = maxDrag;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(chevronPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(chevronPulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [chevronPulse]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && !completedRef.current,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabledRef.current && !completedRef.current && Math.abs(gesture.dx) > 2,
      onPanResponderGrant: () => {
        lastHapticStepRef.current = 0;
      },
      onPanResponderMove: (_, gesture) => {
        const currentMaxDrag = maxDragRef.current;
        const next = Math.min(Math.max(gesture.dx, 0), currentMaxDrag);
        pan.setValue(next);

        const progress = currentMaxDrag > 0 ? next / currentMaxDrag : 0;
        const step = Math.floor(progress * HAPTIC_STEPS);
        if (step !== lastHapticStepRef.current) {
          lastHapticStepRef.current = step;
          tickHaptic();
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const currentMaxDrag = maxDragRef.current;
        const next = Math.min(Math.max(gesture.dx, 0), currentMaxDrag);
        if (currentMaxDrag > 0 && next >= currentMaxDrag * COMPLETE_THRESHOLD) {
          completedRef.current = true;
          successHaptic();
          Animated.timing(pan, {
            toValue: currentMaxDrag,
            duration: 140,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start(() => onComplete());
        } else {
          Animated.spring(pan, {
            toValue: 0,
            friction: 7,
            tension: 80,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const labelOpacity = pan.interpolate({
    inputRange: [0, maxDrag * 0.6],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const fillWidth = Animated.add(pan, THUMB_SIZE + TRACK_PADDING);

  const chevronOpacity1 = chevronPulse.interpolate({
    inputRange: [0, 0.3, 0.6, 1],
    outputRange: [0.25, 1, 0.25, 0.25],
  });
  const chevronOpacity2 = chevronPulse.interpolate({
    inputRange: [0, 0.15, 0.45, 0.75, 1],
    outputRange: [0.25, 0.25, 1, 0.25, 0.25],
  });
  const chevronOpacity3 = chevronPulse.interpolate({
    inputRange: [0, 0.3, 0.6, 0.9, 1],
    outputRange: [0.25, 0.25, 0.25, 1, 0.25],
  });

  return (
    <View
      style={styles.track}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.trackFill, { width: fillWidth }]} />

      <Animated.Text style={[styles.trackLabel, { opacity: labelOpacity }]}>
        Slide to log workout
      </Animated.Text>

      <View style={styles.chevronRow} pointerEvents="none">
        <Animated.View style={{ opacity: chevronOpacity1 }}>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Animated.View>
        <Animated.View style={{ opacity: chevronOpacity2, marginLeft: -6 }}>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Animated.View>
        <Animated.View style={{ opacity: chevronOpacity3, marginLeft: -6 }}>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Animated.View>
      </View>

      <Animated.View
        style={[styles.thumb, { transform: [{ translateX: pan }] }]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="barbell" size={22} color={colors.iconOnDark} />
      </Animated.View>
    </View>
  );
}

function LoggedBar() {
  return (
    <View style={styles.track}>
      <View style={[styles.trackFill, styles.trackFillDisabled]} />
      <Text style={[styles.trackLabel, styles.trackLabelDisabled]}>Already logged today</Text>
      <View style={[styles.thumb, styles.thumbDisabled]}>
        <Ionicons name="checkmark" size={22} color={colors.textSecondary} />
      </View>
    </View>
  );
}

export default function LogWorkoutModal({ visible, onClose }: Props) {
  const { dayStreak, todayWorkoutLogged, todayCardioLogged, lastWorkoutType, logWorkout } = useWorkout();
  const [stage, setStage] = useState<'confirm' | 'celebrate'>('confirm');
  const [displayedStreak, setDisplayedStreak] = useState(dayStreak);
  const [selectedType, setSelectedType] = useState<WorkoutType>(toPillType(lastWorkoutType));
  const [comebackBonus, setComebackBonus] = useState(false);

  // Whichever bucket the currently-selected pill belongs to, and whether
  // that specific bucket is already done for today — this (not the old
  // single day-wide flag) is what decides whether the slider or the
  // "already logged" bar shows.
  const selectedBucketLogged =
    bucketForType(selectedType) === 'cardio' ? todayCardioLogged : todayWorkoutLogged;
  const bothLoggedToday = todayWorkoutLogged && todayCardioLogged;

  const sheetY = useRef(new Animated.Value(40)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const flameScale = useRef(new Animated.Value(0.6)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkRotate = useRef(new Animated.Value(0)).current;
  const countScale = useRef(new Animated.Value(1)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const confetti = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(10)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const xpScale = useRef(new Animated.Value(0)).current;
  const xpOpacity = useRef(new Animated.Value(0)).current;

  // Reset to the confirm step and animate the sheet in whenever it opens.
  // Also re-sync the pre-selected type pill to whatever was picked last
  // time, in case it changed since this sheet was last opened.
  useEffect(() => {
    if (visible) {
      setStage('confirm');
      setDisplayedStreak(dayStreak);
      // Default to last time's pick, unless that bucket is already done
      // today and the other one isn't — then steer toward the one still
      // open, so the common "log workout, later log cardio" flow doesn't
      // require an extra tap to switch pills.
      const lastBucketDone = bucketForType(lastWorkoutType) === 'cardio' ? todayCardioLogged : todayWorkoutLogged;
      if (lastBucketDone && !(todayWorkoutLogged && todayCardioLogged)) {
        setSelectedType(bucketForType(lastWorkoutType) === 'cardio' ? 'strength' : 'cardio');
      } else {
        setSelectedType(toPillType(lastWorkoutType));
      }
      setComebackBonus(false);
      sheetY.setValue(40);
      sheetOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(sheetY, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleLog = () => {
    const wasAlreadyLogged = selectedBucketLogged;
    const isComeback = logWorkout(selectedType);
    setStage('celebrate');

    if (!wasAlreadyLogged) {
      // Only the very first log of the *day* (whichever bucket it is)
      // moves the streak forward — a same-day second bucket log doesn't
      // add a second day to the streak.
      setDisplayedStreak(todayWorkoutLogged || todayCardioLogged ? dayStreak : dayStreak + 1);
      setComebackBonus(isComeback);
    }

    checkScale.setValue(0);
    checkRotate.setValue(0);
    flameScale.setValue(0.5);
    countScale.setValue(1);
    ripple1.setValue(0);
    ripple2.setValue(0);
    confetti.setValue(0);
    titleOpacity.setValue(0);
    titleY.setValue(10);
    subtitleOpacity.setValue(0);
    xpScale.setValue(0);
    xpOpacity.setValue(0);

    // Checkmark pops in with a little overshoot spin, ripple rings echo
    // outward behind it, and confetti bursts out at the same beat.
    Animated.sequence([
      Animated.parallel([
        Animated.spring(checkScale, {
          toValue: 1,
          friction: 4,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(checkRotate, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.spring(flameScale, {
          toValue: 1.25,
          friction: 3,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.spring(flameScale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.parallel([
      Animated.timing(ripple1, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ripple2, {
        toValue: 1,
        duration: 900,
        delay: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(confetti, {
        toValue: 1,
        duration: 1000,
        delay: 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.parallel([
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 260,
        delay: 160,
        useNativeDriver: true,
      }),
      Animated.timing(titleY, {
        toValue: 0,
        duration: 320,
        delay: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 260,
        delay: 260,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.timing(countScale, {
        toValue: 1.3,
        duration: 180,
        delay: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(countScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.parallel([
      Animated.spring(xpScale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        delay: 520,
        useNativeDriver: true,
      }),
      Animated.timing(xpOpacity, {
        toValue: 1,
        duration: 220,
        delay: 520,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      onClose();
    }, AUTO_CLOSE_DELAY);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <RNTouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: sheetOpacity,
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {stage === 'confirm' ? (
            <>
              <View style={styles.iconRing}>
                <View style={styles.iconRingInner}>
                  <Ionicons
                    name={bothLoggedToday ? 'checkmark' : 'barbell'}
                    size={26}
                    color={colors.iconDark}
                  />
                </View>
              </View>

              <Text style={styles.title}>
                {bothLoggedToday ? 'All logged for today' : selectedBucketLogged ? 'Already logged' : 'Log workout'}
              </Text>
              <Text style={styles.subtitle}>
                {bothLoggedToday
                  ? "You're all set for today. Come back tomorrow to keep your streak going."
                  : selectedBucketLogged
                  ? `You've already logged ${bucketForType(selectedType) === 'cardio' ? 'cardio' : 'a workout'} today — pick the other one below.`
                  : 'Mark today as complete and keep your streak going.'}
              </Text>

              <View style={styles.sliderWrap}>
                <TypePills
                  value={selectedType}
                  onChange={setSelectedType}
                  todayWorkoutLogged={todayWorkoutLogged}
                  todayCardioLogged={todayCardioLogged}
                />
                {selectedBucketLogged ? <LoggedBar /> : <SlideToLog onComplete={handleLog} />}
              </View>
            </>
          ) : (
            <View style={styles.celebrateWrap}>
              <View style={styles.burstStage} pointerEvents="none">
                {confettiPieces.map((p) => {
                  const translateX = confetti.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, p.dx],
                  });
                  const translateY = confetti.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, p.dy],
                  });
                  const pieceOpacity = confetti.interpolate({
                    inputRange: [0, 0.12, 0.7, 1],
                    outputRange: [0, 1, 1, 0],
                  });
                  const pieceScale = confetti.interpolate({
                    inputRange: [0, 0.25, 1],
                    outputRange: [0.3, 1, 0.75],
                  });
                  const rotate = confetti.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${p.rotate}deg`],
                  });
                  return (
                    <Animated.View
                      key={p.id}
                      style={[
                        p.isBar ? styles.confettiBar : styles.confettiDot,
                        {
                          width: p.size,
                          height: p.isBar ? p.size * 2.1 : p.size,
                          left: 32 - p.size / 2,
                          top: 32 - (p.isBar ? p.size * 2.1 : p.size) / 2,
                          backgroundColor: p.color,
                          opacity: pieceOpacity,
                          transform: [
                            { translateX },
                            { translateY },
                            { rotate },
                            { scale: pieceScale },
                          ],
                        },
                      ]}
                    />
                  );
                })}

                <Animated.View
                  style={[
                    styles.rippleRing,
                    {
                      opacity: ripple1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.4, 0],
                      }),
                      transform: [
                        {
                          scale: ripple1.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2.2],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.rippleRing,
                    {
                      opacity: ripple2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 0],
                      }),
                      transform: [
                        {
                          scale: ripple2.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.8],
                          }),
                        },
                      ],
                    },
                  ]}
                />

                <Animated.View
                  style={[
                    styles.checkRing,
                    {
                      transform: [
                        { scale: checkScale },
                        {
                          rotate: checkRotate.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-35deg', '0deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Ionicons name="checkmark" size={30} color={colors.iconOnDark} />
                </Animated.View>
              </View>

              <Animated.Text
                style={[
                  styles.celebrateTitle,
                  { opacity: titleOpacity, transform: [{ translateY: titleY }] },
                ]}
              >
                {comebackBonus ? 'Welcome back!' : 'Nice work!'}
              </Animated.Text>
              <Animated.Text style={[styles.celebrateSubtitle, { opacity: subtitleOpacity }]}>
                {comebackBonus
                  ? "Your streak resets today, and that's okay — day 1 starts now."
                  : "Today's workout is logged. Keep the streak alive."}
              </Animated.Text>

              <View style={styles.streakRow}>
                <Animated.View style={{ transform: [{ scale: flameScale }] }}>
                  <Ionicons name="flame" size={22} color="#FF8A3D" />
                </Animated.View>
                <Animated.Text style={[styles.streakCount, { transform: [{ scale: countScale }] }]}>
                  {displayedStreak}
                </Animated.Text>
                <Text style={styles.streakUnit}>day streak</Text>
              </View>

              <Animated.View
                style={[
                  styles.xpBadgeRow,
                  { opacity: xpOpacity, transform: [{ scale: xpScale }] },
                ]}
              >
                <Ionicons name="flash" size={14} color="#B9840A" />
                <Text style={styles.xpBadgeText}>+{XP_PER_WORKOUT} XP</Text>
              </Animated.View>

              {comebackBonus && (
                <Animated.View
                  style={[
                    styles.comebackBadgeRow,
                    { opacity: xpOpacity, transform: [{ scale: xpScale }] },
                  ]}
                >
                  <Ionicons name="sparkles" size={13} color="#8B6BF2" />
                  <Text style={styles.comebackBadgeText}>+{COMEBACK_BONUS_XP} welcome back bonus</Text>
                </Animated.View>
              )}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,13,13,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  sheet: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 32,
    paddingHorizontal: 26,
    alignItems: 'center',
    ...shadow.nav,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  iconRingInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  title: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: type.label,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 6,
  },
  sliderWrap: {
    width: '100%',
    marginTop: 26,
  },
  typePillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    marginHorizontal: 4,
  },
  typePillActive: {
    backgroundColor: colors.iconDark,
    borderColor: colors.iconDark,
  },
  typePillText: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: 5,
  },
  typePillTextActive: {
    color: colors.iconOnDark,
  },
  typePillTextDone: {
    color: colors.textTertiary,
  },
  track: {
    width: '100%',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: '#F2EEEA',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#0D0D0D14',
    borderRadius: TRACK_HEIGHT / 2,
  },
  trackFillDisabled: {
    width: '100%',
    backgroundColor: '#0D0D0D0A',
  },
  trackLabel: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontSize: type.body,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  trackLabelDisabled: {
    color: colors.textTertiary,
  },
  chevronRow: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    position: 'absolute',
    left: TRACK_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.nav,
  },
  thumbDisabled: {
    backgroundColor: colors.ringTrack,
    shadowOpacity: 0,
    elevation: 0,
  },
  celebrateWrap: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  burstStage: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  rippleRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#34A853',
  },
  confettiDot: {
    position: 'absolute',
    borderRadius: 999,
  },
  confettiBar: {
    position: 'absolute',
    borderRadius: 2,
  },
  checkRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#34A853',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  celebrateTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  celebrateSubtitle: {
    fontSize: type.label,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  streakCount: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    marginLeft: 8,
    marginRight: 6,
  },
  streakUnit: {
    fontSize: type.body,
    color: colors.textSecondary,
  },
  xpBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: '#FFF6DD',
  },
  xpBadgeText: {
    fontSize: type.label,
    fontWeight: '800',
    color: '#B9840A',
    marginLeft: 5,
    letterSpacing: 0.2,
  },
  comebackBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: '#F1EBFC',
  },
  comebackBadgeText: {
    fontSize: type.label,
    fontWeight: '800',
    color: '#8B6BF2',
    marginLeft: 5,
    letterSpacing: 0.2,
  },
});
