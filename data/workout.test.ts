import { SplitDayValue } from './splits';
import {
  bucketForType,
  buildStreakHeatmap,
  buildWeeklyXpPoints,
  computeDayStreak,
  computeMaxWeeksBack,
  computeStreakWeek,
  computeStreakWeekForOffset,
  computeWeeklyXp,
  getCurrentWeekDates,
  getWeekRangeLabel,
  isWorkoutDay,
  toDateKey,
} from './workout';

// Fixed "today" so every test is deterministic regardless of when it
// runs. Wednesday, 2024-06-12.
const WED = new Date(2024, 5, 12);

// A couple of functions below (buildStreakHeatmap, getCurrentWeekDates)
// read `new Date()` internally instead of taking a `today` param, so we
// pin the system clock to WED for the whole file rather than passing it
// explicitly everywhere.
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(WED);
});

afterAll(() => {
  jest.useRealTimers();
});

function daysAgo(n: number, from: Date = WED): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d;
}

function keysFor(days: number[]): Set<string> {
  return new Set(days.map((n) => toDateKey(daysAgo(n))));
}

describe('toDateKey', () => {
  it('formats in local time as YYYY-MM-DD, zero-padded', () => {
    expect(toDateKey(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(toDateKey(new Date(2024, 10, 30))).toBe('2024-11-30');
  });
});

describe('bucketForType', () => {
  it('puts cardio in its own bucket', () => {
    expect(bucketForType('cardio')).toBe('cardio');
  });

  it('groups strength and other into the shared workout bucket', () => {
    expect(bucketForType('strength')).toBe('workout');
    expect(bucketForType('other')).toBe('workout');
  });
});

describe('isWorkoutDay', () => {
  const monWedFri: SplitDayValue[] = [
    { day: 'Mon', fullDay: 'Monday', label: 'Push' },
    { day: 'Tue', fullDay: 'Tuesday', label: null },
    { day: 'Wed', fullDay: 'Wednesday', label: 'Pull' },
    { day: 'Thu', fullDay: 'Thursday', label: null },
    { day: 'Fri', fullDay: 'Friday', label: 'Legs' },
    { day: 'Sat', fullDay: 'Saturday', label: null },
    { day: 'Sun', fullDay: 'Sunday', label: null },
  ];

  it('treats every day as required when there is no split', () => {
    expect(isWorkoutDay(WED, null)).toBe(true);
    expect(isWorkoutDay(WED, undefined)).toBe(true);
  });

  it('treats every day as required when the split is all-rest', () => {
    const allRest: SplitDayValue[] = monWedFri.map((d) => ({ ...d, label: null }));
    expect(isWorkoutDay(WED, allRest)).toBe(true);
  });

  it('only requires the labeled days of a real split', () => {
    expect(isWorkoutDay(WED, monWedFri)).toBe(true); // Wed = Pull
    const thursday = new Date(2024, 5, 13);
    expect(isWorkoutDay(thursday, monWedFri)).toBe(false); // Thu = rest
  });
});

describe('computeDayStreak', () => {
  it('is 0 with no logged workouts', () => {
    expect(computeDayStreak(new Set(), null, WED)).toBe(0);
  });

  it('counts consecutive days ending today when today is logged', () => {
    const logged = keysFor([0, 1, 2]); // today, yesterday, day before
    expect(computeDayStreak(logged, null, WED)).toBe(3);
  });

  it('does not break the streak if only today is missing (day still in progress)', () => {
    const logged = keysFor([1, 2, 3]); // yesterday back through 3 days ago, not today
    expect(computeDayStreak(logged, null, WED)).toBe(3);
  });

  it('breaks the streak at the first missed required day before today', () => {
    // Logged today and yesterday, but the day before that is missing.
    const logged = keysFor([0, 1]);
    expect(computeDayStreak(logged, null, WED)).toBe(2);
  });

  it('skips rest days per the split without breaking the streak', () => {
    const monWedFri: SplitDayValue[] = [
      { day: 'Mon', fullDay: 'Monday', label: 'Push' },
      { day: 'Tue', fullDay: 'Tuesday', label: null },
      { day: 'Wed', fullDay: 'Wednesday', label: 'Pull' },
      { day: 'Thu', fullDay: 'Thursday', label: null },
      { day: 'Fri', fullDay: 'Friday', label: 'Legs' },
      { day: 'Sat', fullDay: 'Saturday', label: null },
      { day: 'Sun', fullDay: 'Sunday', label: null },
    ];
    // WED (today, Pull day) logged, MON (Push day) logged; TUE (rest) not
    // logged in between — should NOT break the streak.
    const logged = new Set([toDateKey(WED), toDateKey(daysAgo(2))]); // Wed, Mon
    expect(computeDayStreak(logged, monWedFri, WED)).toBe(2);
  });

  it('a missed required split day still breaks the streak', () => {
    const monWedFri: SplitDayValue[] = [
      { day: 'Mon', fullDay: 'Monday', label: 'Push' },
      { day: 'Tue', fullDay: 'Tuesday', label: null },
      { day: 'Wed', fullDay: 'Wednesday', label: 'Pull' },
      { day: 'Thu', fullDay: 'Thursday', label: null },
      { day: 'Fri', fullDay: 'Friday', label: 'Legs' },
      { day: 'Sat', fullDay: 'Saturday', label: null },
      { day: 'Sun', fullDay: 'Sunday', label: null },
    ];
    // Today (Wed) logged, but last Friday (a required day further back)
    // was missed — streak should stop at today only.
    const logged = new Set([toDateKey(WED)]);
    expect(computeDayStreak(logged, monWedFri, WED)).toBe(1);
  });
});

describe('computeStreakWeekForOffset', () => {
  it('offset 0 matches computeStreakWeek exactly', () => {
    const logged = keysFor([0, 1]);
    expect(computeStreakWeekForOffset(logged, 0, WED)).toEqual(computeStreakWeek(logged, WED));
  });

  it('walks back a full Mon-Sun week per offset', () => {
    // Logged 8 days ago -> falls in *last* week (offset 1), Tuesday.
    const logged = keysFor([8]);
    const thisWeek = computeStreakWeekForOffset(logged, 0, WED);
    const lastWeek = computeStreakWeekForOffset(logged, 1, WED);
    expect(thisWeek.every((d) => !d.active)).toBe(true);
    expect(lastWeek[1].active).toBe(true); // Tuesday of last week
    expect(lastWeek.filter((d) => d.active)).toHaveLength(1);
  });
});

describe('getWeekRangeLabel', () => {
  it('labels the two most recent weeks by name', () => {
    expect(getWeekRangeLabel(0, WED)).toBe('This Week');
    expect(getWeekRangeLabel(1, WED)).toBe('Last Week');
  });

  it('labels older weeks with an actual date range', () => {
    // WED = 2024-06-12; two weeks back is the Mon-Sun of 2024-05-27..06-02.
    expect(getWeekRangeLabel(2, WED)).toBe('May 27 – Jun 2');
  });
});

describe('computeMaxWeeksBack', () => {
  it('is 0 with no logged history', () => {
    expect(computeMaxWeeksBack([], WED)).toBe(0);
  });

  it('reflects how many full weeks back the earliest log falls', () => {
    // 8 days ago lands in last week -> 1 week of history to page back into.
    const logged = [toDateKey(daysAgo(8))];
    expect(computeMaxWeeksBack(logged, WED)).toBe(1);
  });

  it('is 0 when the earliest log is still within the current week', () => {
    const logged = [toDateKey(daysAgo(1))];
    expect(computeMaxWeeksBack(logged, WED)).toBe(0);
  });
});

describe('computeStreakWeek', () => {
  it('builds a Mon-Sun week with the right days marked active', () => {
    const logged = keysFor([0, 1]); // today (Wed) + yesterday (Tue)
    const week = computeStreakWeek(logged, WED);
    expect(week.map((d) => d.day)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    // Mon, Tue, Wed indices are 0,1,2 for this fixed date.
    expect(week[0].active).toBe(false); // Monday not logged
    expect(week[1].active).toBe(true); // Tuesday logged
    expect(week[2].active).toBe(true); // Wednesday (today) logged
    expect(week[3].active).toBe(false); // Thursday hasn't happened yet
  });
});

describe('getCurrentWeekDates', () => {
  it('reorders a Mon-first streak week into Sun-first calendar order', () => {
    const streakWeek = computeStreakWeek(keysFor([0]), WED); // just today logged
    const week = getCurrentWeekDates(streakWeek);
    expect(week.map((d) => d.label)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    expect(week.filter((d) => d.isToday)).toHaveLength(1);
  });
});

describe('buildWeeklyXpPoints / computeWeeklyXp', () => {
  it('assigns xpPerWorkout to active days and sums them consistently', () => {
    const week = computeStreakWeek(keysFor([0, 1, 2]), WED); // 3 active days
    const points = buildWeeklyXpPoints(week, 50);
    const activeCount = points.filter((p) => p.value === 50).length;
    expect(activeCount).toBe(3);
    expect(computeWeeklyXp(week, 50)).toBe(150);
  });

  it('is 0 for a week with nothing logged', () => {
    const week = computeStreakWeek(new Set(), WED);
    expect(computeWeeklyXp(week, 50)).toBe(0);
  });
});

describe('buildStreakHeatmap', () => {
  it('marks exactly the logged days active, over the requested window', () => {
    const logged = keysFor([0, 3, 10]);
    const heatmap = buildStreakHeatmap(logged, 14);
    expect(heatmap).toHaveLength(14);
    expect(heatmap.filter((d) => d.active)).toHaveLength(3);
    expect(heatmap[heatmap.length - 1].isToday).toBe(true);
  });

  it('accepts a plain string array as well as a Set', () => {
    const days = [toDateKey(WED)];
    const heatmap = buildStreakHeatmap(days, 5);
    expect(heatmap.filter((d) => d.active)).toHaveLength(1);
  });
});
