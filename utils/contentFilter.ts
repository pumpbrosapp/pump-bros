// Basic client-side content filter for DM and group chat text. This is
// intentionally simple — a fixed word list with word-boundary matching —
// and is meant to catch obvious cases, not serve as a complete
// moderation system. LEGAL_AUDIT.md flags the lack of any
// objectionable-content filtering as an App Store readiness issue; this
// is a first pass at that, not a replacement for real moderation
// tooling (e.g. a hosted moderation API) or server-side enforcement.
//
// The list below is deliberately limited to common, unambiguous
// profanity so it's safe to keep in source control and easy to extend.
// It is not a slur list — swap in a proper moderation provider before
// relying on this for anything beyond a basic first line of defense.
const PROHIBITED_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'cunt',
  'piss off',
  'motherfucker',
];

// Matches each term as a whole word (or phrase, for multi-word terms),
// case-insensitively, so it catches "Fuck" and "FUCK" but not innocuous
// substrings like "classic" (which contains "ass" but not as its own
// word). Basic and easy to fool with spacing/leetspeak — good enough
// for a first pass, not airtight.
const FILTER_REGEX = new RegExp(
  `\\b(${PROHIBITED_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})\\b`,
  'i'
);

// Returns true if `text` contains language the basic filter flags as
// not allowed. Used to block sending a DM or group message before it
// ever reaches local storage or the server.
export function containsProhibitedLanguage(text: string): boolean {
  if (!text) return false;
  return FILTER_REGEX.test(text);
}

// User-facing copy for the blocked-send error, shared so DM and group
// chat show the exact same message.
export const CONTENT_BLOCKED_TITLE = "Message not sent";
export const CONTENT_BLOCKED_MESSAGE =
  "Your message contains language that isn't allowed. Please edit it and try again.";

// Same filter, applied to usernames and display names — user-facing copy
// kept separate from the chat message copy above since the context is
// different (saving a profile field vs. sending a message).
export const PROHIBITED_NAME_TITLE = "Name not saved";
export const PROHIBITED_NAME_MESSAGE =
  "That name isn't allowed. Please choose a different one.";
