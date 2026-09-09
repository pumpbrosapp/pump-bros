import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { TabName } from '../types';
import { useUser } from '../context/UserContext';
import { colors, radius, shadow, type } from '../theme';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';

interface Props {
  active: TabName;
  onChange: (tab: TabName) => void;
  onAddPress?: () => void;
}

const TABS: { key: TabName; label: string; activeIcon: string; inactiveIcon: string }[] = [
  { key: 'home', label: 'Home', activeIcon: 'home', inactiveIcon: 'home-outline' },
  { key: 'workout', label: 'Progress', activeIcon: 'bar-chart', inactiveIcon: 'bar-chart-outline' },
  { key: 'social', label: 'Social', activeIcon: 'people', inactiveIcon: 'people-outline' },
  { key: 'profile', label: 'Profile', activeIcon: 'person-circle', inactiveIcon: 'person-circle-outline' },
];

// Height of the soft scrim behind the floating nav bar. Taller than the
// pill itself so the fade starts well above it and never shows a hard edge.
const FADE_HEIGHT = 150;

export default function BottomNav({ active, onChange, onAddPress }: Props) {
  const { avatarUri } = useUser();

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Svg
        width="100%"
        height={FADE_HEIGHT}
        style={styles.fade}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="navFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
            <Stop offset="0.45" stopColor={colors.background} stopOpacity={0.55} />
            <Stop offset="0.75" stopColor={colors.background} stopOpacity={0.92} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={FADE_HEIGHT} fill="url(#navFade)" />
      </Svg>

      <View style={styles.row}>
        <View style={styles.container}>
          {TABS.map((tab) => {
            const isActive = active === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tab}
                onPress={() => onChange(tab.key)}
                activeOpacity={0.75}
              >
                <View style={[styles.tabInner, isActive && styles.tabInnerActive]}>
                  {tab.key === 'profile' && avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarIcon}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Ionicons
                      name={(isActive ? tab.activeIcon : tab.inactiveIcon) as any}
                      size={22}
                      color={isActive ? colors.navActive : colors.navInactive}
                    />
                  )}
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.fab}
          onPress={onAddPress}
          activeOpacity={0.85}
          hapticStyle="confirm"
        >
          <View style={styles.plusVertical} />
        <View style={styles.plusHorizontal} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 6,
    ...shadow.nav,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radius.cardSmall,
  },
  tabInnerActive: {
    backgroundColor: colors.navActiveBg,
  },
  avatarIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  tabLabel: {
    fontSize: type.navLabel + 1,
    fontWeight: '600',
    color: colors.navInactive,
    marginTop: 4,
  },
  tabLabelActive: {
    color: colors.navActive,
    fontWeight: '700',
  },
  fab: {
    marginLeft: 14,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.nav,
  },
  plusVertical: {
    position: 'absolute',
    width: 3.5,
    height: 22,
    borderRadius: 2,
    backgroundColor: colors.iconOnDark,
  },
  plusHorizontal: {
    position: 'absolute',
    width: 22,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: colors.iconOnDark,
  },
});
