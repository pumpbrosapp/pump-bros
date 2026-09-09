import React, { useRef } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSplit } from '../context/SplitContext';
import { useWorkout } from '../context/WorkoutContext';
import SplitBuilder from './SplitBuilder';
import { colors, radius, shadow, type } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function WorkoutSplitModal({ visible, onClose }: Props) {
  const { hasSplit } = useSplit();
  const { splitSyncFailed, retrySplitSync } = useWorkout();
  const scrollRef = useRef<ScrollView>(null);

  const handleClose = () => {
    // The split itself was already applied locally the moment the person
    // tapped a day/preset — this button just confirms and dismisses. But
    // the push to the server happens in the background (WorkoutContext),
    // so if that push already came back failed, say so now instead of
    // letting the person walk away thinking it's saved everywhere.
    if (splitSyncFailed) {
      Alert.alert(
        "Couldn't sync your split",
        "Your split is saved on this device, but we couldn't sync it — friends and other devices won't see it yet. Try again from a stronger connection.",
        [
          { text: 'Close anyway', style: 'cancel', onPress: onClose },
          { text: 'Retry', onPress: retrySplitSync },
        ]
      );
      return;
    }
    onClose();
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workout Split</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.introTitle}>{hasSplit ? 'Your split' : 'Set your split'}</Text>
          <Text style={styles.introSubtitle}>
            Tap a day to set what you train, or pick a template below to start faster.
          </Text>

          <View style={styles.builderSpacing}>
            <SplitBuilder onPresetApplied={scrollToTop} />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85} onPress={handleClose}>
            <Text style={styles.saveBtnText}>Save split</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginTop: 8,
  },
  introSubtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 19,
    paddingRight: 12,
  },
  builderSpacing: {
    marginTop: 22,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  saveBtn: {
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.nav,
  },
  saveBtnText: {
    color: colors.iconOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
});
