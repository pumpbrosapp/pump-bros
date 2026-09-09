import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

// Linking.openURL rejects when there's no app registered to handle the
// scheme — which for mailto: is just "no mail client is set up", a very
// normal state on a simulator/emulator or a device someone hasn't
// configured. None of the callers awaited or caught that rejection, so
// it surfaced as an uncaught-in-promise error instead of any visible
// feedback. This wraps that in canOpenURL + try/catch and falls back to
// copying the address to the clipboard, so there's always some way to
// actually reach us even when the OS can't hand off to a mail app.
export async function openMailto(email: string, subject: string): Promise<boolean> {
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      await Clipboard.setStringAsync(email);
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    // openURL can still throw even after canOpenURL says yes (e.g. a
    // flaky intent resolution) — same fallback either way.
    await Clipboard.setStringAsync(email).catch(() => {});
    return false;
  }
}
