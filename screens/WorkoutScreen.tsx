import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, Text, ScrollView, RefreshControl, StyleSheet, Dimensions, PanResponder, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect, Polyline, Polygon, Circle, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildWeeklyXpPoints,
  buildStreakHeatmap,
  computeStreakWeekForOffset,
  computeMaxWeeksBack,
  computeMaxHeatmapBlocksBack,
  getWeekRangeLabel,
  getHeatmapRangeLabel,
  isWorkoutDay,
  XP_MILESTONES,
  WeeklyPoint,
} from '../data/workout';
import { useWorkout, XP_PER_WORKOUT } from '../context/WorkoutContext';
import { useSplit } from '../context/SplitContext';
import { tapHaptic } from '../utils/haptics';
import { colors, radius, shadow, type } from '../theme';

// Minimum horizontal drag (in graph-local px) before a touch on the chart
// is treated as a swipe to a different week rather than a tap/scrub on the
// current one. Also requires the drag to be clearly more horizontal than
// vertical, so a slightly-off vertical scrub doesn't accidentally page.
const WEEK_SWIPE_THRESHOLD = 40;

// How many days one page of the Streak History heatmap covers.
const HEATMAP_TOTAL_DAYS = 35;

const CHART_WIDTH = 300;
const CHART_HEIGHT = 110;
const CHART_TOP_PAD = 14;
const CHART_BOTTOM_PAD = 14;

function buildChartPoints(weeklyXp: WeeklyPoint[], maxValue: number) {
  const usableHeight = CHART_HEIGHT - CHART_TOP_PAD - CHART_BOTTOM_PAD;
  const stepX = CHART_WIDTH / (weeklyXp.length - 1);

  return weeklyXp.map((point, index) => {
    const x = index * stepX;
    const ratio = maxValue > 0 ? point.value / maxValue : 0;
    const y = CHART_TOP_PAD + (1 - ratio) * usableHeight;
    return { x, y, value: point.value, day: point.day };
  });
}

// Turns the sparse weekly data points into a dense, smoothly-curved set
// of points (Catmull-Rom spline) so the line reads as a gentle curve
// instead of sharp straight-line segments.
function smoothChartPoints(points: { x: number; y: number }[], segmentsPerGap = 16) {
  if (points.length < 3) return points;
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  const result: { x: number; y: number }[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    for (let t = 0; t < segmentsPerGap; t++) {
      const u = t / segmentsPerGap;
      const u2 = u * u;
      const u3 = u2 * u;
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * u +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * u +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);
      result.push({ x, y });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function WorkoutScreen({
  active = true,
  onChartTouchStart,
  onChartTouchEnd,
}: {
  active?: boolean;
  // Let the parent tab pager know a touch is live on the Weekly XP chart,
  // so it can disable its own horizontal paging for the duration — see
  // chartPanResponder below. Both are optional so the screen still works
  // standalone (e.g. in tests) without a pager wrapping it.
  onChartTouchStart?: () => void;
  onChartTouchEnd?: () => void;
}) {
  const { dayStreak, streakWeek, todayLogged, xp, loggedDates } = useWorkout();
  const { days: splitDays, hasSplit } = useSplit();
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (active) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [active]);

  const todayIsWorkoutDay = isWorkoutDay(new Date(), splitDays);

  // Which Mon-Sun week the Weekly XP graph is showing. 0 = this week, 1 =
  // last week, etc. — increases as the user swipes back through history.
  const [weekOffset, setWeekOffset] = useState(0);
  const loggedDatesSet = useMemo(() => new Set(loggedDates), [loggedDates]);

  // How far back swiping is allowed to go: never further than the week the
  // user's very first logged workout falls in, so paging can't wander into
  // an endless run of empty pre-history graphs.
  const maxWeeksBack = useMemo(() => computeMaxWeeksBack(loggedDates), [loggedDates]);
  const maxWeeksBackRef = useRef(maxWeeksBack);
  maxWeeksBackRef.current = maxWeeksBack;

  // The current week already comes from context (and stays live-updating
  // as workouts are logged); any other week is derived on demand from the
  // full logged-dates history.
  const displayedStreakWeek = useMemo(
    () => (weekOffset === 0 ? streakWeek : computeStreakWeekForOffset(loggedDatesSet, weekOffset)),
    [weekOffset, streakWeek, loggedDatesSet]
  );
  const weekRangeLabel = useMemo(() => getWeekRangeLabel(weekOffset), [weekOffset]);

  const weeklyXp = buildWeeklyXpPoints(displayedStreakWeek, XP_PER_WORKOUT);
  const weeklyXpTotal = weeklyXp.reduce((sum, p) => sum + p.value, 0);
  const chartPoints = buildChartPoints(weeklyXp, XP_PER_WORKOUT);
  const peak = chartPoints.reduce((a, b) => (b.value > a.value ? b : a));
  // The filled dot always marks today when the chart is showing the
  // current week — falls back to the peak day for past weeks, since
  // there's no "today" to point at there. streakWeek/chartPoints are
  // Mon-first, so convert JS's Sun-first getDay() to match.
  const todayIndex = (new Date().getDay() + 6) % 7;
  const highlightIndex = weekOffset === 0 ? todayIndex : chartPoints.indexOf(peak);

  const goToPreviousWeek = useCallback(() => {
    setWeekOffset((prev) => {
      if (prev >= maxWeeksBackRef.current) return prev;
      tapHaptic();
      return prev + 1;
    });
  }, []);

  const goToNextWeek = useCallback(() => {
    setWeekOffset((prev) => {
      if (prev <= 0) return prev;
      tapHaptic();
      return prev - 1;
    });
  }, []);

  // Scrubbing state for the Weekly XP chart: the XP tooltip is hidden by
  // default and only appears (and follows the finger) while the user is
  // actively touching/dragging across the graph.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartPointsRef = useRef(chartPoints);
  chartPointsRef.current = chartPoints;
  const chartLayoutWidthRef = useRef(CHART_WIDTH);

  const handleChartTouch = useCallback((locationX: number) => {
    const pts = chartPointsRef.current;
    const width = chartLayoutWidthRef.current || CHART_WIDTH;
    const ratio = Math.max(0, Math.min(1, locationX / width));
    const x = ratio * CHART_WIDTH;
    const stepX = CHART_WIDTH / (pts.length - 1);
    let idx = Math.round(x / stepX);
    idx = Math.max(0, Math.min(pts.length - 1, idx));
    setActiveIndex(idx);
  }, []);

  // A drag across the chart does double duty: small/vertical-ish movement
  // scrubs the tooltip across the currently-displayed week (unchanged
  // behavior), while a clearly horizontal drag past WEEK_SWIPE_THRESHOLD
  // pages to the previous/next week on release — left swipe goes further
  // back in time, right swipe comes forward toward the current week.
  // Termination request is allowed (rather than refused) so the enclosing
  // ScrollView can reclaim a touch that turns into a vertical pull — with
  // it fixed at "refuse", this responder held onto every touch that
  // started anywhere on the chart, including a pull-to-refresh drag,
  // which starved the ScrollView's native pan gesture and made the
  // RefreshControl spinner render pinned to the very top of the screen
  // instead of tracking the scroll like it does on Home/Profile. A
  // horizontal week-swipe still isn't affected, since the ScrollView's
  // own vertical pan recognizer has no reason to request termination
  // for a mostly-horizontal drag.
  const chartPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: (evt) => {
        // Claim the gesture for the chart immediately so the outer tab
        // pager's own horizontal ScrollView doesn't also start dragging
        // pages underneath the chart's week-swipe.
        onChartTouchStart?.();
        handleChartTouch(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => handleChartTouch(evt.nativeEvent.locationX),
      onPanResponderRelease: (_evt, gestureState) => {
        setActiveIndex(null);
        onChartTouchEnd?.();
        const { dx, dy } = gestureState;
        if (Math.abs(dx) > WEEK_SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) {
            goToPreviousWeek();
          } else {
            goToNextWeek();
          }
        }
      },
      onPanResponderTerminate: () => {
        setActiveIndex(null);
        onChartTouchEnd?.();
      },
    })
  ).current;

  const activePoint = activeIndex !== null ? chartPoints[activeIndex] : null;

  // Split adherence: compare each planned split day against whether that
  // day was actually logged. Rest days (no label) always count as a match.
  // Kept separate from the swipeable section below — this one always
  // reflects the current week, for the compact dots on the "Today's
  // Workout" card up top.
  const splitAdherence = splitDays.map((d, i) => ({
    day: d.day,
    planned: d.label,
    hit: d.label ? streakWeek[i]?.active ?? false : true,
  }));

  // Which Mon-Sun week the Split Adherence card is showing — same idea as
  // weekOffset above, but independent so scrubbing one section doesn't
  // page the other.
  const [splitWeekOffset, setSplitWeekOffset] = useState(0);
  const displayedSplitWeek = useMemo(
    () => (splitWeekOffset === 0 ? streakWeek : computeStreakWeekForOffset(loggedDatesSet, splitWeekOffset)),
    [splitWeekOffset, streakWeek, loggedDatesSet]
  );
  const splitWeekRangeLabel = useMemo(() => getWeekRangeLabel(splitWeekOffset), [splitWeekOffset]);
  const displayedSplitAdherence = splitDays.map((d, i) => ({
    day: d.day,
    planned: d.label,
    hit: d.label ? displayedSplitWeek[i]?.active ?? false : true,
  }));
  const displayedPlannedCount = displayedSplitAdherence.filter((d) => d.planned).length;
  const displayedHitCount = displayedSplitAdherence.filter((d) => d.planned && d.hit).length;
  const adherencePercent =
    displayedPlannedCount > 0 ? Math.round((displayedHitCount / displayedPlannedCount) * 100) : null;

  const goToPreviousSplitWeek = useCallback(() => {
    setSplitWeekOffset((prev) => {
      if (prev >= maxWeeksBackRef.current) return prev;
      tapHaptic();
      return prev + 1;
    });
  }, []);

  const goToNextSplitWeek = useCallback(() => {
    setSplitWeekOffset((prev) => {
      if (prev <= 0) return prev;
      tapHaptic();
      return prev - 1;
    });
  }, []);

  // Same swipe-to-page gesture as the Weekly XP chart, minus the
  // scrubbing tooltip — a horizontal drag past the threshold pages the
  // Split Adherence card to the previous/next week on release.
  const splitPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: () => {
        onChartTouchStart?.();
      },
      onPanResponderRelease: (_evt, gestureState) => {
        onChartTouchEnd?.();
        const { dx, dy } = gestureState;
        if (Math.abs(dx) > WEEK_SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) {
            goToPreviousSplitWeek();
          } else {
            goToNextSplitWeek();
          }
        }
      },
      onPanResponderTerminate: () => {
        onChartTouchEnd?.();
      },
    })
  ).current;

  // Which HEATMAP_TOTAL_DAYS-sized block the Streak History heatmap is
  // showing — 0 = the most recent block (ending today), 1 = the block
  // before that, etc. Independent of the offsets above for the same
  // reason.
  const [heatmapOffset, setHeatmapOffset] = useState(0);
  const maxHeatmapBlocksBack = useMemo(
    () => computeMaxHeatmapBlocksBack(loggedDates, HEATMAP_TOTAL_DAYS),
    [loggedDates]
  );
  const maxHeatmapBlocksBackRef = useRef(maxHeatmapBlocksBack);
  maxHeatmapBlocksBackRef.current = maxHeatmapBlocksBack;

  const heatmapEndDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - heatmapOffset * HEATMAP_TOTAL_DAYS);
    return d;
  }, [heatmapOffset]);
  const heatmapRangeLabel = useMemo(
    () => getHeatmapRangeLabel(heatmapOffset, HEATMAP_TOTAL_DAYS),
    [heatmapOffset]
  );

  const goToPreviousHeatmapBlock = useCallback(() => {
    setHeatmapOffset((prev) => {
      if (prev >= maxHeatmapBlocksBackRef.current) return prev;
      tapHaptic();
      return prev + 1;
    });
  }, []);

  const goToNextHeatmapBlock = useCallback(() => {
    setHeatmapOffset((prev) => {
      if (prev <= 0) return prev;
      tapHaptic();
      return prev - 1;
    });
  }, []);

  const heatmapPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: () => {
        onChartTouchStart?.();
      },
      onPanResponderRelease: (_evt, gestureState) => {
        onChartTouchEnd?.();
        const { dx, dy } = gestureState;
        if (Math.abs(dx) > WEEK_SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) {
            goToPreviousHeatmapBlock();
          } else {
            goToNextHeatmapBlock();
          }
        }
      },
      onPanResponderTerminate: () => {
        onChartTouchEnd?.();
      },
    })
  ).current;

  // Streak heatmap: HEATMAP_TOTAL_DAYS days ending on heatmapEndDate, built
  // from the real logged dates rather than reconstructed/guessed.
  const heatmapDays = buildStreakHeatmap(loggedDates, HEATMAP_TOTAL_DAYS, heatmapEndDate);
  const heatmapWeeks: (typeof heatmapDays)[] = [];
  for (let i = 0; i < heatmapDays.length; i += 7) {
    heatmapWeeks.push(heatmapDays.slice(i, i + 7));
  }

  const nextMilestone = XP_MILESTONES.find((m) => xp < m.xp);
  const prevMilestoneXp = [...XP_MILESTONES].reverse().find((m) => xp >= m.xp)?.xp ?? 0;

  const smoothPoints = smoothChartPoints(chartPoints);
  const polylinePoints = smoothPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${polylinePoints} ${CHART_WIDTH},${CHART_HEIGHT} 0,${CHART_HEIGHT}`;

  const totalLength = smoothPoints.reduce((acc, p, index) => {
    if (index === 0) return 0;
    const prev = smoothPoints[index - 1];
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    return acc + Math.sqrt(dx * dx + dy * dy);
  }, 0);

  const pathProgress = useRef(new Animated.Value(0)).current;
  const dotOpacities = useRef(chartPoints.map(() => new Animated.Value(0))).current;

  const runChartAnimation = useCallback(() => {
    pathProgress.setValue(0);
    dotOpacities.forEach((v) => v.setValue(0));

    Animated.timing(pathProgress, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    Animated.stagger(
      1100 / (dotOpacities.length - 1),
      dotOpacities.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
  }, [pathProgress, dotOpacities]);

  // Re-run the draw-in animation the first time the page becomes visible,
  // not just when the component happens to mount (all tabs stay mounted
  // in the pager, so plain mount-on-load only fires once at app launch).
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) {
      runChartAnimation();
    }
    wasActive.current = active;
  }, [active, runChartAnimation]);

  // Replay the draw-in animation whenever the user pages to a different
  // week, so swiping reads as loading a fresh graph rather than the line
  // silently teleporting to new positions. Skipped on first mount — that
  // case is already covered by the active-page effect above.
  const isFirstWeekOffset = useRef(true);
  useEffect(() => {
    if (isFirstWeekOffset.current) {
      isFirstWeekOffset.current = false;
      return;
    }
    runChartAnimation();
  }, [weekOffset, runChartAnimation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    runChartAnimation();
    setTimeout(() => setRefreshing(false), 900);
  }, [runChartAnimation]);

  const dashOffset = pathProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [totalLength, 0],
  });

  const areaOpacity = pathProgress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const { width: screenWidth } = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  // Extend the gradient up by the status-bar inset so it reaches the true
  // top edge of the screen instead of stopping where the safe area begins.
  const gradientHeight = 340 + insets.top;

  return (
    <View style={styles.container}>
      <Svg
        style={styles.bgGradient}
        width={screenWidth}
        height={gradientHeight}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="bgFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.backgroundGradientTop} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={screenWidth} height={gradientHeight} fill="url(#bgFade)" />
      </Svg>

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.title}>Progress</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingTop: 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.iconDark}
            colors={[colors.iconDark]}
          />
        }
      >
        <View style={styles.topRow}>
          <View style={styles.workoutCard}>
            <View
              style={[
                styles.workoutIconWrap,
                todayLogged && styles.workoutIconWrapDone,
                !todayLogged && todayIsWorkoutDay && styles.workoutIconWrapWaiting,
                !todayLogged && !todayIsWorkoutDay && styles.workoutIconWrapRest,
              ]}
            >
              <Ionicons
                name={todayLogged ? 'checkmark-circle' : todayIsWorkoutDay ? 'time-outline' : 'moon-outline'}
                size={17}
                color={todayLogged ? '#1C8A3C' : todayIsWorkoutDay ? '#FF8A3D' : '#4C8BF5'}
              />
            </View>

            <Text style={styles.workoutStatus}>
              {todayLogged ? 'Done' : todayIsWorkoutDay ? 'Not logged' : 'Rest day'}
            </Text>
            <Text style={styles.cardLabel}>Today's Workout</Text>

            {hasSplit && (
              <View style={styles.workoutSplitDotsRow}>
                {splitAdherence.map((d, index) => (
                  <View key={index} style={styles.workoutSplitDayCol}>
                    <Text style={styles.workoutSplitDayLabel}>{d.day.charAt(0)}</Text>
                    <View
                      style={[
                        styles.workoutSplitDot,
                        d.planned && d.hit && styles.workoutSplitDotActive,
                      ]}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.streakCard}>
            <View style={styles.streakIconWrap}>
              <Ionicons name="flame" size={16} color="#FF8A3D" />
            </View>
            <Text style={styles.streakValue}>{dayStreak}</Text>
            <Text style={styles.streakLabel}>Day Streak</Text>

            <View style={styles.streakWeekRow}>
              {streakWeek.map((item, index) => (
                <View key={index} style={styles.streakDayCol}>
                  <Text style={styles.streakDayLabel}>{item.day}</Text>
                  <View
                    style={[
                      styles.streakDot,
                      item.active && styles.streakDotActive,
                    ]}
                  />
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.chartSection}>
          <View style={styles.chartHeaderRow}>
            <Text style={styles.sectionTitle}>Weekly XP</Text>
            <View style={styles.pillBadge}>
              <Text style={styles.pillBadgeText}>
                {weeklyXpTotal} XP{weekOffset === 0 ? ' this week' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.weekNavRow}>
            <TouchableOpacity
              onPress={goToPreviousWeek}
              disabled={weekOffset >= maxWeeksBack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.weekNavButton}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={weekOffset >= maxWeeksBack ? colors.textTertiary : colors.textPrimary}
              />
            </TouchableOpacity>

            <Text style={styles.weekNavLabel}>{weekRangeLabel}</Text>

            <TouchableOpacity
              onPress={goToNextWeek}
              disabled={weekOffset <= 0}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.weekNavButton}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={weekOffset <= 0 ? colors.textTertiary : colors.textPrimary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.chartCard}>
            {activePoint && (
              <View
                pointerEvents="none"
                style={[
                  styles.tooltipWrap,
                  {
                    left: `${(activePoint.x / CHART_WIDTH) * 100}%`,
                    top: activePoint.y - 30,
                  },
                ]}
              >
                <View style={styles.tooltip}>
                  <Text style={styles.tooltipValue}>{activePoint.value} XP</Text>
                  <Text style={styles.tooltipDay}>{activePoint.day}</Text>
                </View>
              </View>
            )}

            <View
              onLayout={(e) => {
                chartLayoutWidthRef.current = e.nativeEvent.layout.width;
              }}
              {...chartPanResponder.panHandlers}
            >
              <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
                <Defs>
                  <LinearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#5FC98A" stopOpacity="1" />
                    <Stop offset="1" stopColor="#1C8A3C" stopOpacity="1" />
                  </LinearGradient>
                  <LinearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#34A853" stopOpacity="0.28" />
                    <Stop offset="1" stopColor="#34A853" stopOpacity="0" />
                  </LinearGradient>
                </Defs>

                <AnimatedPolygon points={areaPoints} fill="url(#chartArea)" opacity={areaOpacity} />

                <AnimatedPolyline
                  points={polylinePoints}
                  fill="none"
                  stroke="url(#chartLine)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={[totalLength, totalLength]}
                  strokeDashoffset={dashOffset}
                />

                {activePoint && (
                  <Line
                    x1={activePoint.x}
                    y1={CHART_TOP_PAD}
                    x2={activePoint.x}
                    y2={CHART_HEIGHT - CHART_BOTTOM_PAD}
                    stroke={colors.textTertiary}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                )}

                {chartPoints.map((p, index) => (
                  <React.Fragment key={index}>
                    {activeIndex === null && index === highlightIndex && (
                      <AnimatedCircle cx={p.x} cy={p.y} r={9} fill="#34A853" opacity={Animated.multiply(dotOpacities[index], 0.18)} />
                    )}
                    <AnimatedCircle
                      cx={p.x}
                      cy={p.y}
                      r={activeIndex === index ? 5 : activeIndex === null && index === highlightIndex ? 4.5 : 3}
                      fill={activeIndex === index || (activeIndex === null && index === highlightIndex) ? '#34A853' : '#FFFFFF'}
                      stroke="#34A853"
                      strokeWidth={2}
                      opacity={dotOpacities[index]}
                    />
                  </React.Fragment>
                ))}
              </Svg>
            </View>

            <View style={styles.chartDaysRow}>
              {weeklyXp.map((point, index) => (
                <Text key={index} style={styles.chartDayLabel}>
                  {point.day}
                </Text>
              ))}
            </View>
          </View>

          <Text style={styles.motivationText}>
            Consistency is key. Keep logging your workouts to stay on track.
          </Text>
        </View>

        <View style={styles.splitSection}>
          <View style={styles.chartHeaderRow}>
            <Text style={styles.sectionTitle}>Split Adherence</Text>
            {adherencePercent !== null && (
              <View style={styles.pillBadge}>
                <Text style={styles.pillBadgeText}>{adherencePercent}% on plan</Text>
              </View>
            )}
          </View>

          {hasSplit ? (
            <>
              <View style={styles.weekNavRow}>
                <TouchableOpacity
                  onPress={goToPreviousSplitWeek}
                  disabled={splitWeekOffset >= maxWeeksBack}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.weekNavButton}
                >
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={splitWeekOffset >= maxWeeksBack ? colors.textTertiary : colors.textPrimary}
                  />
                </TouchableOpacity>

                <Text style={styles.weekNavLabel}>{splitWeekRangeLabel}</Text>

                <TouchableOpacity
                  onPress={goToNextSplitWeek}
                  disabled={splitWeekOffset <= 0}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.weekNavButton}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={splitWeekOffset <= 0 ? colors.textTertiary : colors.textPrimary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.splitCard} {...splitPanResponder.panHandlers}>
                <View style={styles.splitRow}>
                  {displayedSplitAdherence.map((d, index) => (
                    <View key={index} style={styles.splitDayCol}>
                      <Text style={styles.splitDayLabel}>{d.day}</Text>
                      <View
                        style={[
                          styles.splitDot,
                          d.planned && styles.splitDotPlanned,
                          d.planned && d.hit && styles.splitDotHit,
                          d.planned && !d.hit && styles.splitDotMissed,
                        ]}
                      >
                        {d.planned && d.hit && (
                          <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                        )}
                      </View>
                      <Text style={styles.splitDayFocus} numberOfLines={1}>
                        {d.planned ?? 'Rest'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.splitEmptyCard}>
              <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.splitEmptyText}>
                Set up a split on your Profile to track adherence here.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.heatmapSection}>
          <Text style={styles.sectionTitle}>Streak History</Text>

          <View style={styles.weekNavRow}>
            <TouchableOpacity
              onPress={goToPreviousHeatmapBlock}
              disabled={heatmapOffset >= maxHeatmapBlocksBack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.weekNavButton}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={heatmapOffset >= maxHeatmapBlocksBack ? colors.textTertiary : colors.textPrimary}
              />
            </TouchableOpacity>

            <Text style={styles.weekNavLabel}>{heatmapRangeLabel}</Text>

            <TouchableOpacity
              onPress={goToNextHeatmapBlock}
              disabled={heatmapOffset <= 0}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.weekNavButton}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={heatmapOffset <= 0 ? colors.textTertiary : colors.textPrimary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.heatmapCard} {...heatmapPanResponder.panHandlers}>
            <View style={styles.heatmapGrid}>
              {heatmapWeeks.map((week, wIndex) => (
                <View key={wIndex} style={styles.heatmapCol}>
                  {week.map((day, dIndex) => (
                    <View
                      key={dIndex}
                      style={[
                        styles.heatmapCell,
                        day.active && styles.heatmapCellActive,
                        day.isToday && styles.heatmapCellToday,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
            <View style={styles.heatmapLegendRow}>
              <Text style={styles.heatmapLegendText}>{HEATMAP_TOTAL_DAYS / 7} weeks</Text>
              <View style={styles.heatmapLegendRight}>
                <Text style={styles.heatmapLegendText}>Less</Text>
                <View style={[styles.heatmapLegendSwatch, { backgroundColor: colors.ringTrack }]} />
                <View style={[styles.heatmapLegendSwatch, { backgroundColor: '#FF8A3D' }]} />
                <Text style={styles.heatmapLegendText}>More</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.milestonesSection}>
          <Text style={styles.sectionTitle}>XP Milestones</Text>
          <View style={styles.milestonesCard}>
            {nextMilestone && (
              <View style={styles.milestoneProgressRow}>
                <Text style={styles.milestoneProgressText}>
                  {xp} / {nextMilestone.xp} XP to {nextMilestone.label}
                </Text>
                <View style={styles.milestoneProgressTrack}>
                  <View
                    style={[
                      styles.milestoneProgressFill,
                      {
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((xp - prevMilestoneXp) / (nextMilestone.xp - prevMilestoneXp)) * 100
                          )
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            <View style={styles.badgeGrid}>
              {XP_MILESTONES.map((m) => {
                const unlocked = xp >= m.xp;
                return (
                  <View key={m.xp} style={styles.badgeItem}>
                    <View style={[styles.badgeIconWrap, unlocked && styles.badgeIconWrapUnlocked]}>
                      <Ionicons
                        name={m.icon as any}
                        size={20}
                        color={unlocked ? '#FFFFFF' : colors.textTertiary}
                      />
                    </View>
                    <Text style={[styles.badgeLabel, unlocked && styles.badgeLabelUnlocked]} numberOfLines={2}>
                      {m.label}
                    </Text>
                    <Text style={styles.badgeXp}>{m.xp} XP</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  title: {
    fontSize: type.pageTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  topRow: {
    flexDirection: 'row',
  },
  workoutCard: {
    flex: 1.3,
    backgroundColor: colors.card,
    borderRadius: radius.cardSmall,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    ...shadow.card,
  },
  cardLabel: {
    fontSize: type.label,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  workoutStatus: {
    fontSize: type.statValue,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  workoutIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  workoutIconWrapDone: {
    borderColor: '#CDEBD7',
  },
  workoutIconWrapWaiting: {
    borderColor: '#FFE1C7',
  },
  workoutIconWrapRest: {
    borderColor: '#D7E6FB',
  },
  workoutSplitDotsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  workoutSplitDayCol: {
    alignItems: 'center',
    marginHorizontal: 2,
  },
  workoutSplitDayLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: colors.textTertiary,
    marginBottom: 3,
  },
  workoutSplitDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  workoutSplitDotActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  streakCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.cardSmall,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
    ...shadow.card,
  },
  streakIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  streakValue: {
    fontSize: type.statValue,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  streakLabel: {
    fontSize: type.label,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  streakWeekRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  streakDayCol: {
    alignItems: 'center',
    marginHorizontal: 2,
  },
  streakDayLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: colors.textTertiary,
    marginBottom: 3,
  },
  streakDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakDotActive: {
    backgroundColor: '#FF8A3D',
    borderColor: '#FF8A3D',
  },
  chartSection: {
    marginTop: 22,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  pillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillBadgeText: {
    fontSize: type.label,
    fontWeight: '700',
    color: '#000000',
  },
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  weekNavButton: {
    padding: 4,
  },
  weekNavLabel: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginHorizontal: 14,
    minWidth: 110,
    textAlign: 'center',
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingTop: 34,
    paddingHorizontal: 14,
    paddingBottom: 10,
    ...shadow.card,
  },
  tooltipWrap: {
    position: 'absolute',
    transform: [{ translateX: -24 }],
    zIndex: 5,
  },
  tooltip: {
    backgroundColor: colors.iconDark,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
  },
  tooltipValue: {
    color: colors.iconOnDark,
    fontSize: 12,
    fontWeight: '700',
  },
  tooltipDay: {
    color: '#C9CDD3',
    fontSize: 9,
    marginTop: 1,
  },
  chartDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  chartDayLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    flex: 1,
    textAlign: 'center',
  },
  motivationText: {
    fontSize: type.label,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 17,
  },
  splitSection: {
    marginTop: 24,
  },
  splitCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    ...shadow.card,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splitDayCol: {
    alignItems: 'center',
    flex: 1,
  },
  splitDayLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
    marginBottom: 6,
  },
  splitDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitDotPlanned: {
    borderColor: colors.textPrimary,
  },
  splitDotHit: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  splitDotMissed: {
    backgroundColor: 'transparent',
    borderColor: colors.textPrimary,
  },
  splitDayFocus: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 6,
    maxWidth: 40,
    textAlign: 'center',
  },
  splitEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    ...shadow.card,
  },
  splitEmptyText: {
    fontSize: type.label,
    color: colors.textSecondary,
    marginLeft: 10,
    flexShrink: 1,
  },
  heatmapSection: {
    marginTop: 24,
  },
  heatmapCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginTop: 12,
    ...shadow.card,
  },
  heatmapGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  heatmapCol: {
    marginHorizontal: 2,
  },
  heatmapCell: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.ringTrack,
    marginVertical: 2,
  },
  heatmapCellActive: {
    backgroundColor: '#FF8A3D',
  },
  heatmapCellToday: {
    borderWidth: 1.5,
    borderColor: colors.iconDark,
  },
  heatmapLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  heatmapLegendText: {
    fontSize: type.caption,
    color: colors.textSecondary,
  },
  heatmapLegendRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heatmapLegendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginHorizontal: 3,
  },
  milestonesSection: {
    marginTop: 24,
  },
  milestonesCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginTop: 12,
    ...shadow.card,
  },
  milestoneProgressRow: {
    marginBottom: 16,
  },
  milestoneProgressText: {
    fontSize: type.label,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  milestoneProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
  },
  milestoneProgressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#34A853',
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badgeItem: {
    width: '33.33%',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  badgeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  badgeIconWrapUnlocked: {
    backgroundColor: '#34A853',
    borderColor: '#34A853',
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
    textAlign: 'center',
  },
  badgeLabelUnlocked: {
    color: colors.textPrimary,
  },
  badgeXp: {
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
