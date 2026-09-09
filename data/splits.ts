// Data model + presets for the "Workout Split" builder on the Profile tab.

export interface SplitDayValue {
  day: string; // short label, e.g. 'Mon'
  fullDay: string; // 'Monday'
  label: string | null; // muscle-group / focus label, null = not set (Rest)
}

export const WEEK_DAYS: { day: string; fullDay: string }[] = [
  { day: 'Mon', fullDay: 'Monday' },
  { day: 'Tue', fullDay: 'Tuesday' },
  { day: 'Wed', fullDay: 'Wednesday' },
  { day: 'Thu', fullDay: 'Thursday' },
  { day: 'Fri', fullDay: 'Friday' },
  { day: 'Sat', fullDay: 'Saturday' },
  { day: 'Sun', fullDay: 'Sunday' },
];

// Quick-pick options shown when a user taps a day in the manual builder.
// Kept short on purpose so the picker doesn't feel overwhelming; anything
// else can be typed in via the "Custom" option.
export const DAY_LABEL_OPTIONS: string[] = [
  'Push',
  'Pull',
  'Legs',
  'Upper',
  'Lower',
  'Full Body',
  'Rest',
];

// A short color/icon key per label so chips and previews stay visually
// consistent between the builder and the preset cards.
export const LABEL_COLORS: Record<string, string> = {
  Push: '#4C8BF5',
  Pull: '#34A853',
  Legs: '#F4B400',
  Upper: '#8B6BF2',
  Lower: '#FF8A3D',
  'Full Body': '#E0483E',
  Rest: '#B9B7BC',
};

export function colorForLabel(label: string | null): string {
  if (!label) return LABEL_COLORS.Rest;
  return LABEL_COLORS[label] ?? '#0D0D0D';
}

export interface SplitPreset {
  id: string;
  name: string;
  subtitle: string;
  daysPerWeek: number;
  // Mon-Sun, 7 entries, null = rest day.
  pattern: (string | null)[];
}

export const SPLIT_PRESETS: SplitPreset[] = [
  {
    id: 'ppl',
    name: 'Push Pull Legs',
    subtitle: 'Classic 6-day split, popular for balanced hypertrophy',
    daysPerWeek: 6,
    pattern: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', null],
  },
  {
    id: 'arnold',
    name: 'Arnold Split',
    subtitle: "Arnold Schwarzenegger's chest/back, shoulders/arms, legs rotation",
    daysPerWeek: 6,
    pattern: [
      'Chest & Back',
      'Shoulders & Arms',
      'Legs',
      'Chest & Back',
      'Shoulders & Arms',
      'Legs',
      null,
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    subtitle: '4-day split, great for building strength with more recovery',
    daysPerWeek: 4,
    pattern: ['Upper', 'Lower', null, 'Upper', 'Lower', null, null],
  },
  {
    id: 'full-body',
    name: 'Full Body',
    subtitle: '3-day split hitting every muscle group each session',
    daysPerWeek: 3,
    pattern: ['Full Body', null, 'Full Body', null, 'Full Body', null, null],
  },
  {
    id: 'bro-split',
    name: 'Bro Split',
    subtitle: 'One muscle group a day — chest, back, legs, shoulders, arms',
    daysPerWeek: 5,
    pattern: ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', null, null],
  },
  {
    id: 'phul',
    name: 'PHUL',
    subtitle: 'Power Hypertrophy Upper Lower — strength and size in one plan',
    daysPerWeek: 4,
    pattern: ['Upper Power', 'Lower Power', null, 'Upper Hypertrophy', 'Lower Hypertrophy', null, null],
  },
];
