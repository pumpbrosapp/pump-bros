import { containsProhibitedLanguage } from './contentFilter';

describe('containsProhibitedLanguage', () => {
  it('returns false for ordinary messages', () => {
    expect(containsProhibitedLanguage('Hey, want to hit legs tomorrow?')).toBe(false);
  });

  it('returns false for empty or whitespace-only text', () => {
    expect(containsProhibitedLanguage('')).toBe(false);
    expect(containsProhibitedLanguage('   ')).toBe(false);
  });

  it('flags a message containing a prohibited term', () => {
    expect(containsProhibitedLanguage('you are an asshole')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(containsProhibitedLanguage('SHIT that was a hard set')).toBe(true);
  });

  it('matches whole words only, not innocuous substrings', () => {
    // "classic" contains "ass" as a substring but isn't the word "ass".
    expect(containsProhibitedLanguage('that was a classic workout')).toBe(false);
  });

  it('matches a multi-word prohibited phrase', () => {
    expect(containsProhibitedLanguage('just piss off already')).toBe(true);
  });

  it('flags a raw (pre-slugify) name input containing a prohibited word', () => {
    // Usernames are slugified (lowercased, spaces/punctuation stripped)
    // before being saved, so callers check both the raw input and the
    // slugified form. This is the raw-input side of that — note the
    // word-boundary matching means a word run together with other
    // characters and no separator (e.g. "xXFuckXx") won't be caught;
    // that's a known limitation of this basic filter, not something
    // this change tries to solve.
    expect(containsProhibitedLanguage('Fuck You')).toBe(true);
  });

  it('does not flag an ordinary display name or username', () => {
    expect(containsProhibitedLanguage('Alex Rivera')).toBe(false);
    expect(containsProhibitedLanguage('gym_bro_22')).toBe(false);
  });
});
