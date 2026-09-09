import React, { useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';

const ACTION_WIDTH = 84;

interface Props {
  children: React.ReactNode;
  actionLabel: string;
  actionIcon: keyof typeof Ionicons.glyphMap;
  actionColor: string;
  onAction: () => void;
  style?: object;
}

// Swipe the row left to reveal a single action button (delete/leave/etc),
// iOS-Mail style. Built on react-native-gesture-handler rather than the
// bare PanResponder used elsewhere in the app (e.g. the log-workout
// slider) because this row sits nested inside a vertical ScrollView that
// itself sits inside the horizontal tab-paging ScrollView — plain
// PanResponder doesn't reliably win that three-way gesture negotiation,
// gesture-handler does.
export default function SwipeableRow({ children, actionLabel, actionIcon, actionColor, onAction, style }: Props) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [ACTION_WIDTH, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.actionWrap, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={[styles.action, { backgroundColor: actionColor }]}
          activeOpacity={0.85}
          hapticStyle="confirm"
          onPress={() => {
            swipeableRef.current?.close();
            onAction();
          }}
        >
          <Ionicons name={actionIcon} size={18} color="#FFFFFF" />
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={ACTION_WIDTH / 2}
      friction={1.6}
      containerStyle={style}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actionWrap: {
    width: ACTION_WIDTH,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
