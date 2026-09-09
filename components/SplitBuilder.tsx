import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { useSplit } from '../context/SplitContext';
import { DAY_LABEL_OPTIONS, SPLIT_PRESETS, SplitPreset, colorForLabel } from '../data/splits';
import { colors, radius, shadow, type } from '../theme';

const PRESET_CARD_WIDTH = 148;
const PRESET_CARD_GAP = 12;

function tapHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

interface Props {
  // Called right after a preset is applied — lets the parent scroll back
  // to the top of its own container so the newly-filled builder is visible.
  onPresetApplied?: () => void;
}

// The actual day-by-day / template split builder. Shared by the Profile
// tab's WorkoutSplitModal and the onboarding "set your split" step, so a
// split picked in either place lives in the same SplitContext.
export default function SplitBuilder({ onPresetApplied }: Props) {
  const { days, splitName, hasSplit, setDayLabel, applyPreset, resetSplit } = useSplit();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [customIndex, setCustomIndex] = useState<number | null>(null);
  const [customText, setCustomText] = useState('');

  const closeAllPickers = () => {
    setExpandedIndex(null);
    setCustomIndex(null);
    setCustomText('');
  };

  const toggleDay = (index: number) => {
    tapHaptic();
    if (expandedIndex === index) {
      setExpandedIndex(null);
      setCustomIndex(null);
    } else {
      setExpandedIndex(index);
      setCustomIndex(null);
    }
  };

  const chooseLabel = (index: number, option: string) => {
    tapHaptic();
    if (option === 'Rest') {
      setDayLabel(index, null);
    } else {
      setDayLabel(index, option);
    }
    setExpandedIndex(null);
  };

  const openCustom = (index: number) => {
    tapHaptic();
    setCustomIndex(index);
    setCustomText(days[index].label ?? '');
  };

  const commitCustom = () => {
    if (customIndex === null) return;
    const trimmed = customText.trim();
    if (trimmed.length > 0) {
      setDayLabel(customIndex, trimmed);
    }
    setCustomIndex(null);
    setExpandedIndex(null);
    setCustomText('');
  };

  const handleApplyPreset = (preset: SplitPreset) => {
    tapHaptic();
    closeAllPickers();
    applyPreset(preset);
    onPresetApplied?.();
  };

  return (
    <View>
      <View style={styles.builderCard}>
        {days.map((d, index) => {
          const isExpanded = expandedIndex === index;
          const isCustomOpen = customIndex === index;
          return (
            <View key={d.day}>
              <TouchableOpacity
                style={[
                  styles.dayRow,
                  index === days.length - 1 && !isExpanded && styles.dayRowLast,
                ]}
                activeOpacity={0.7}
                onPress={() => toggleDay(index)}
              >
                <Text style={styles.dayAbbrev}>{d.day}</Text>
                <View style={styles.dayLabelWrap}>
                  {d.label ? (
                    <View
                      style={[styles.labelPill, { backgroundColor: `${colorForLabel(d.label)}1A` }]}
                    >
                      <View style={[styles.labelDot, { backgroundColor: colorForLabel(d.label) }]} />
                      <Text style={[styles.labelPillText, { color: colorForLabel(d.label) }]}>
                        {d.label}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.dayPlaceholder}>Rest day</Text>
                  )}
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.chipRow}>
                  {DAY_LABEL_OPTIONS.map((option) => {
                    const isActive = option === 'Rest' ? d.label === null : d.label === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.chip,
                          isActive && {
                            backgroundColor: colorForLabel(option === 'Rest' ? null : option),
                            borderColor: colorForLabel(option === 'Rest' ? null : option),
                          },
                        ]}
                        activeOpacity={0.75}
                        onPress={() => chooseLabel(index, option)}
                      >
                        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                          {option}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity style={styles.chip} activeOpacity={0.75} onPress={() => openCustom(index)}>
                    <Ionicons name="create-outline" size={13} color={colors.textPrimary} />
                    <Text style={[styles.chipText, styles.chipTextWithIcon]}>Custom</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isCustomOpen && (
                <View style={styles.customRow}>
                  <TextInput
                    style={styles.customInput}
                    value={customText}
                    onChangeText={setCustomText}
                    placeholder="e.g. Arms & Abs"
                    placeholderTextColor={colors.textTertiary}
                    autoFocus
                    maxLength={24}
                    returnKeyType="done"
                    onSubmitEditing={commitCustom}
                  />
                  <TouchableOpacity onPress={commitCustom} hitSlop={8}>
                    <Ionicons name="checkmark-circle" size={26} color={colors.iconDark} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {hasSplit && (
        <TouchableOpacity style={styles.clearBtn} activeOpacity={0.7} onPress={resetSplit}>
          <Ionicons name="refresh-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.clearBtnText}>Clear split</Text>
        </TouchableOpacity>
      )}

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or choose a template</Text>
        <View style={styles.dividerLine} />
      </View>

      <Text style={styles.sectionTitle}>Popular Splits</Text>

      <View
        style={styles.presetScroll}
        // Horizontal scroll of preset cards. Kept as a plain View + ScrollView
        // rather than a shared ref since callers may nest this inside their
        // own scroll containers (onboarding) or not (modal).
      >
        <PresetScroller
          activePresetName={splitName}
          onSelect={handleApplyPreset}
        />
      </View>
    </View>
  );
}

function PresetScroller({
  activePresetName,
  onSelect,
}: {
  activePresetName: string | null;
  onSelect: (preset: SplitPreset) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={PRESET_CARD_WIDTH + PRESET_CARD_GAP}
      snapToAlignment="start"
      contentContainerStyle={styles.presetScrollContent}
      style={styles.presetScrollInner}
    >
      {SPLIT_PRESETS.map((preset) => {
        const isActive = activePresetName === preset.name;
        return (
          <TouchableOpacity
            key={preset.id}
            style={[styles.presetCard, isActive && styles.presetCardActive]}
            activeOpacity={0.8}
            onPress={() => onSelect(preset)}
          >
            <View>
              <View style={styles.presetTopRow}>
                <Text style={styles.presetDaysBadge}>{preset.daysPerWeek}d/wk</Text>
                {isActive && (
                  <View style={styles.presetActiveBadge}>
                    <Ionicons name="checkmark" size={11} color={colors.iconOnDark} />
                  </View>
                )}
              </View>
              <Text style={styles.presetName}>{preset.name}</Text>
              <Text style={styles.presetSubtitle} numberOfLines={5}>
                {preset.subtitle}
              </Text>
            </View>
            <View style={styles.presetPatternRow}>
              {preset.pattern.map((p, i) => (
                <View
                  key={i}
                  style={[
                    styles.presetPatternDot,
                    { backgroundColor: p ? colors.textPrimary : colors.textTertiary },
                  ]}
                />
              ))}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  builderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  dayRowLast: {
    borderBottomWidth: 0,
  },
  dayAbbrev: {
    width: 44,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  dayLabelWrap: {
    flex: 1,
  },
  dayPlaceholder: {
    fontSize: type.body,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  labelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  labelPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 14,
    paddingTop: 2,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: colors.iconOnDark,
  },
  chipTextWithIcon: {
    marginLeft: 4,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
  },
  customInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginRight: 10,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  clearBtnText: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: 5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  dividerText: {
    fontSize: type.caption,
    fontWeight: '700',
    color: colors.textTertiary,
    marginHorizontal: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  presetScroll: {
    marginHorizontal: -20,
  },
  presetScrollInner: {
    // no additional styling; wrapper above handles the bleed margin
  },
  presetScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  presetCard: {
    width: PRESET_CARD_WIDTH,
    height: 216,
    backgroundColor: colors.card,
    borderRadius: radius.cardSmall,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginRight: PRESET_CARD_GAP,
    justifyContent: 'space-between',
    ...shadow.card,
  },
  presetCardActive: {
    borderColor: colors.iconDark,
    borderWidth: 1.5,
  },
  presetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presetName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 14,
    lineHeight: 19,
  },
  presetDaysBadge: {
    fontSize: type.caption,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  presetActiveBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  presetPatternRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetPatternDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
});
