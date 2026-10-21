# Mad Station Mobile (Android companion)

This is a separate Android companion project under `android-app/`. The current
desktop application is built around Electron and Windows-specific browser-view,
IPC, download, and session-management APIs; those parts cannot be copied directly
into Android. This first mobile edition focuses on the portable everyday pieces:

- a touch-friendly home screen with quick access to AI chat, image, video, and research websites;
- an in-app HTTPS browser with Back, Home, and Open in browser controls;
- favorites, Notes, and Tasks stored locally on the Android device;
- a dark/light appearance toggle.

## Build an APK

The repository workflow **Android APK** builds a debug APK for every push to an
`android/**` branch and can also be started manually from GitHub Actions.

1. Open the repository's **Actions** tab.
2. Select **Android APK** and open a successful run on branch `android/mobile-companion`.
3. Download the `mad-station-mobile-debug-apk` artifact and extract it.
4. Transfer `app-debug.apk` to your Android phone, open it, and approve installation
   from that source if Android asks. Only install builds you trust.

For a local build, install Android Studio / Android SDK and JDK 17, then run:

```sh
cd android-app
gradle assembleDebug
```

The APK is written to `android-app/app/build/outputs/apk/debug/app-debug.apk`.

## Known limitations of this first mobile edition

- This is a companion MVP, not a full port of the Windows program. Electron-dependent
  workspaces, native download management, system/process monitoring, and desktop homepage
  themes are not implemented here.
- Websites run inside Android WebView. Some providers block embedded sign-in or require
  device-specific browser capabilities; use **Open in browser** in that case.
- The WebView uses Android's normal cookie store. Separate account sessions are **not**
  isolated between providers/accounts in this initial version.
- Notes, tasks, favorites, and appearance are stored locally on this device. They are not
  synchronized with the Windows app and are removed if app data is cleared.
- This initial workflow creates a debug APK. A distributable release build needs a
  separately managed signing key and signing configuration.

No desktop app files or dependencies are changed by adding this Android project.
