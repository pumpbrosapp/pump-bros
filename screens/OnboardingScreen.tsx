import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HapticTouchableOpacity as TouchableOpacity } from '../components/Haptic';
import { colors, radius, shadow, type } from '../theme';
import { useSplit } from '../context/SplitContext';
import { useAuth } from '../context/AuthContext';
import SplitBuilder from '../components/SplitBuilder';
import AuthScreen from './AuthScreen';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Slide {
  id: string;
  icon: IconName;
  iconBg: string;
  title: string;
  subtitle: string;
}

// Kept short and benefit-led on purpose — this is a quick first-run intro,
// not a feature tour. Each slide maps to one core loop in the app.
const SLIDES: Slide[] = [
  {
    id: 'welcome',
    icon: 'flash',
    iconBg: '#FFF6DD',
    title: 'Welcome to Pump Bros',
    subtitle: 'Turn every workout into XP. Train, track, and level yourself up.',
  },
  {
    id: 'streak',
    icon: 'flame',
    iconBg: '#FFF1E6',
    title: 'Build your streak',
    subtitle: 'Log a workout each day to grow your streak and stay consistent.',
  },
  {
    id: 'friends',
    icon: 'trophy',
    iconBg: '#F3EEFF',
    title: 'Compete with friends',
    subtitle: 'Climb the leaderboard and see how your XP stacks up.',
  },
  {
    id: 'split',
    icon: 'barbell',
    iconBg: '#EAF2FF',
    title: 'Set your split',
    subtitle: 'Pick a template like Push Pull Legs, or build your own from scratch.',
  },
];

function tapHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// The auth step lives at this virtual index, one past the last real slide.
const AUTH_INDEX = SLIDES.length;
const LAST_SLIDE_INDEX = SLIDES.length - 1;

interface Props {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLastSlide = index === LAST_SLIDE_INDEX;
  const isAuthStep = index === AUTH_INDEX;
  const { isAuthenticated } = useAuth();

  const goToIndex = (next: number) => {
    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    setIndex(next);
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (next !== index) setIndex(next);
  };

  const handleNext = () => {
    tapHaptic();
    if (isLastSlide) {
      // Move into the real sign-up/sign-in step instead of finishing right away.
      goToIndex(AUTH_INDEX);
    } else {
      goToIndex(index + 1);
    }
  };

  const handleSkip = () => {
    tapHaptic();
    goToIndex(AUTH_INDEX);
  };

  // Onboarding only finishes once the user has actually created/signed in
  // to a real account — AuthScreen below calls the real signUpWithEmail /
  // signInWithEmail / completeGoogleSignIn / completeAppleSignIn methods,
  // and this fires the moment AuthContext reports a genuine authenticated
  // session (covers email, Google, and Apple sign-in alike).
  useEffect(() => {
    if (isAuthStep && isAuthenticated) {
      tapHaptic();
      onDone();
    }
  }, [isAuthStep, isAuthenticated, onDone]);

  return (
    <View style={styles.container}>
      <Svg
        style={styles.bgGradient}
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="onboardBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.backgroundGradientTop} stopOpacity="1" />
            <Stop offset="0.6" stopColor={colors.background} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="url(#onboardBg)" />
      </Svg>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {!isLastSlide && !isAuthStep && (
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} hitSlop={10}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          scrollEnabled={!isAuthStep}
        >
          {SLIDES.map((slide) =>
            slide.id === 'split' ? (
              <View key={slide.id} style={styles.splitSlide}>
                <SplitStep />
              </View>
            ) : (
              <View key={slide.id} style={styles.slide}>
                <View style={[styles.iconRing, { backgroundColor: slide.iconBg }]}>
                  <View style={styles.iconRingInner}>
                    <Ionicons name={slide.icon} size={34} color={colors.iconDark} />
                  </View>
                </View>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.subtitle}>{slide.subtitle}</Text>
              </View>
            )
          )}

          <View style={styles.authSlide}>
            <AuthScreen />
          </View>
        </ScrollView>

        {!isAuthStep && (
          <View style={styles.footer}>
            <View style={styles.dotsRow}>
              {SLIDES.map((slide, i) => (
                <View key={slide.id} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>

            <TouchableOpacity style={styles.nextBtn} activeOpacity={0.85} onPress={handleNext}>
              <Text style={styles.nextBtnText}>{isLastSlide ? 'Continue' : 'Next'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

// The "set your split" onboarding step. Lets the user pick a preset or
// build a custom split right here — it reads/writes the same SplitContext
// used on the Profile tab, so whatever they land on carries straight over
// with no extra save step.
function SplitStep() {
  const { hasSplit } = useSplit();
  const scrollRef = useRef<ScrollView>(null);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.splitScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.splitHeader}>
        <View style={[styles.iconRing, styles.splitIconRing, { backgroundColor: '#EAF2FF' }]}>
          <View style={styles.splitIconRingInner}>
            <Ionicons name="barbell" size={26} color={colors.iconDark} />
          </View>
        </View>
        <Text style={styles.title}>Set your split</Text>
        <Text style={styles.subtitle}>
          {hasSplit
            ? "You're set — you can fine-tune this anytime from your profile."
            : 'Pick a template, or build your own day by day.'}
        </Text>
      </View>

      <SplitBuilder onPresetApplied={scrollToTop} />
    </ScrollView>
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
  safe: {
    flex: 1,
  },
  skipBtn: {
    position: 'absolute',
    top: 8,
    right: 20,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconRingInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginBottom: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
    marginHorizontal: 3,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.iconDark,
  },
  nextBtn: {
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.nav,
  },
  nextBtnText: {
    color: colors.iconOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
  authSlide: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  splitSlide: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  splitScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  splitHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  splitIconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    marginBottom: 16,
  },
  splitIconRingInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
});
