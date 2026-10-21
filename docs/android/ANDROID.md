# Mad Station Mobile (Android companion)

The separate Android companion project lives under `android-app/`. The existing
Windows app is built around Electron and Windows-specific browser-view, IPC,
downloads, process monitoring, and session APIs; those parts cannot be copied
directly into Android. This mobile edition ports portable everyday workflows
while retaining the existing Windows application unchanged.

## Features currently included

- Touch-friendly AI-service discovery with categories, search, and favorites.
- Built-in HTTPS browser with Back, Home, and Open in browser controls.
- Basic native downloads through Android Download Manager, with system notifications and files saved to Downloads.
- Custom HTTPS shortcuts with add, edit, and delete.
- Clipboard snippet history and reusable saved snippets; for Android privacy, the app records only copies initiated inside Mad Station rather than monitoring the system clipboard.
- **Prompt Studio:** prompt templates for coding, research, writing, image prompts,
  and learning; a local prompt formatter; and a saved prompt library.
- **Notes:** create, edit, search, pin, copy, and delete notes.
- **Tasks:** priorities, due dates, completion filters, and deletion.
- Dark/light mode and accent color selection.
- Local JSON backup and restore for favorites, shortcuts, prompts, notes, tasks, clipboard snippets,
  and appearance settings, with native Android share/copy support.

Prompt Studio formats user-supplied text locally; it does not call a model. AI
services remain third-party websites and may require sign-in or subscriptions.

## Build an APK

The GitHub Actions workflow **Android APK** builds a debug APK for pushes to
`android/**` branches and can also be triggered manually.

1. Open the repository's **Actions** tab.
2. Select **Android APK** and open a successful run on branch
   `android/mobile-companion`.
3. Download the `mad-station-mobile-debug-apk` artifact and extract it.
4. Transfer `app-debug.apk` to your Android phone, open it, and approve installing
   apps from that source if Android asks. Only install builds you trust.

For a local build, install Android Studio / Android SDK and JDK 17, then run:

```sh
cd android-app
gradle assembleDebug
```

The APK is written to `android-app/app/build/outputs/apk/debug/app-debug.apk`.

## Known limitations

- This is a companion MVP, not a full port of every Windows feature.
- Electron workspaces, isolated per-account browser sessions, Windows process/RAM
  monitoring, the full desktop downloads controller, and desktop homepage themes are
  not implemented in the mobile app.
- Websites run inside Android WebView. Some providers block embedded sign-in or
  require device-specific browser behavior; use **Open in browser** when needed.
- The embedded browser currently uses Android's normal WebView cookie store.
  Separate sessions per account are not isolated.
- Notes, tasks, favorites, prompts, shortcuts, and appearance are local to this
  app. They do not sync with the Windows edition. Export a backup before clearing
  app data or replacing the phone.
- The workflow creates a debug APK. A public distributable release build needs a
  separately managed signing key and signing configuration.
