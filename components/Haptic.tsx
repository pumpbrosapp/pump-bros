import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, Pressable, PressableProps } from 'react-native';
import { tapHaptic, confirmHaptic } from '../utils/haptics';

interface HapticExtras {
  // 'light' (default) suits most taps; 'confirm' suits primary/submit actions.
  hapticStyle?: 'light' | 'confirm' | 'none';
}

function fire(style: HapticExtras['hapticStyle']) {
  if (style === 'none') return;
  if (style === 'confirm') confirmHaptic();
  else tapHaptic();
}

export function HapticTouchableOpacity({
  onPress,
  hapticStyle = 'light',
  ...rest
}: TouchableOpacityProps & HapticExtras) {
  return (
    <TouchableOpacity
      {...rest}
      onPress={(e) => {
        if (!rest.disabled) fire(hapticStyle);
        onPress?.(e);
      }}
    />
  );
}

export function HapticPressable({
  onPress,
  hapticStyle = 'light',
  ...rest
}: PressableProps & HapticExtras) {
  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        if (!rest.disabled) fire(hapticStyle);
        onPress?.(e);
      }}
    />
  );
}
