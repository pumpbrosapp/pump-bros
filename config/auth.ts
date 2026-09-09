// Google Sign-In configuration.
//
// "Continue with Google" uses expo-auth-session, which opens Google's
// hosted OAuth consent screen in a browser and redirects back into the
// app. That flow needs OAuth client IDs from a Google Cloud project —
// there's no way to ship working Google sign-in without them, so you'll
// need to create your own:
//
//   1. Go to https://console.cloud.google.com/apis/credentials
//   2. Create an OAuth consent screen (External is fine for testing).
//   3. Create an OAuth client ID for each platform you plan to ship:
//        - "iOS" client       -> GOOGLE_IOS_CLIENT_ID
//        - "Android" client   -> GOOGLE_ANDROID_CLIENT_ID
//        - "Web application" client -> GOOGLE_WEB_CLIENT_ID
//          (also used for Expo Go / `expo start` testing, and as the
//          fallback for web builds)
//   4. For the iOS client, use your app's bundle identifier
//      (see ios.bundleIdentifier in app.json).
//   5. For the Android client, use your package name + SHA-1
//      (see android.package in app.json).
//   6. For the Web client, add this redirect URI:
//        https://auth.expo.io/@your-expo-username/gymbro
//      (or the URI printed in the console the first time you tap
//      "Continue with Google" in dev — expo-auth-session logs it).
//
// Until these are filled in, the Google button shows a friendly message
// explaining that it needs to be configured, instead of crashing.
export const GOOGLE_IOS_CLIENT_ID = '224540967505-6nv7tmi6fbpvul4rdi0sc6m4bdkfq32a.apps.googleusercontent.com';
export const GOOGLE_ANDROID_CLIENT_ID = '';
export const GOOGLE_WEB_CLIENT_ID = '';

export const isGoogleSignInConfigured = Boolean(
  GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID
);
