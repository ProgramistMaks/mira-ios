# Widgets and Dynamic Island

Implementation is present in source; native compilation and device/UI acceptance are pending. See VERIFICATION.md. No widget screenshot or IPA is approved for delivery.

## Surfaces and interactions

- The “Рядом с Мирой” WidgetKit extension offers small and medium Home Screen widgets, plus circular, rectangular and inline Lock Screen widgets. The small/accessory widgets open the conversation. The medium widget also opens Commands and Settings. These are quick actions, not a stale copy of chat status.
- `mira://chat`, `mira://commands` and `mira://settings` work on cold launch and when another sheet is presented. Navigation preserves the draft, never sends a message and never enables the microphone. Unknown routes, credentials, ports, query parameters and fragments are rejected.
- ActivityKit reflects actual recording, inference, speech preparation and playback. It provides compact, minimal and expanded Dynamic Island presentations and a Lock Screen card on supported devices without an island. The system controls surface availability and placement.
- Expanded/Lock Screen controls open the app or stop the interaction through a `LiveActivityIntent`, which executes in the app process. A session identifier prevents a previous activity's Stop button from cancelling a newer interaction.
- The payload contains only a phase, an opaque session ID and its start time. Messages, drafts, notes, model weights and credentials are not shared with the widget extension. No App Group, server or push notification service is needed.
- The settings toggle persists independently of cloud configuration. Existing settings without this new optional field keep working. System denial or request failure does not prevent ordinary chat.

## Lifecycle limits

Already-playing speech continues when the app is backgrounded or the screen is locked, using the existing AVAudioPlayer and playback audio session with the declared `audio` background mode. The existing Live Activity remains actionable, so Stop cancels actual playback without opening the app. Recording, inference and speech preparation are cancelled on backgrounding; no new recording or inference is started by a widget. Those interrupted phases end the activity with “Разговор приостановлен”; the final Lock Screen card may remain for up to 45 seconds. Completed playback ends with “Готово”; explicit Stop dismisses immediately. Idle app launch never creates an activity. ActivityKit cannot create a new activity after the app has entered the background; if speech begins immediately before backgrounding and its activity hasn't been requested yet, audio may continue without an island until the app returns.

Updates are serialized and phase transitions are coalesced for 120 ms to avoid recreating activities between synchronous speech handovers. While the app is running (including actual audible playback), a 30-second heartbeat renews a 90-second stale deadline. If the process disappears before ending the activity, stale UI replaces the running status with an invitation to open Mira; it does not claim the microphone is still active. A user-dismissed activity is not recreated until a later interaction. App launch removes orphaned activities. A short UIKit background task allows ActivityKit's final end operation to complete; it is not used to keep inference, a microphone or silent audio running. Interruptions still stop speech.

Widget backgrounds use the system's WidgetKit container and accent handling. Dynamic Island uses its system presentation, with lavender accents and readable action labels. Native iOS 26 glass/tint behavior, increased text size and Lock Screen presentation still need visual review.

## Building and signing

XcodeGen embeds `MiraWidgets.appex` in `Companion.app/PlugIns`. The extension's default bundle ID is `app.personal.companion.widgets`, with matching app/extension versions. `NSSupportsLiveActivities` and the `mira` URL scheme are declared in the app plist. `Scripts/check-widget-bundle.py` checks the real archived bundle before IPA packaging and rejects a missing extension, executable, URL scheme or mismatched versions.

Re-sign the main application **and the nested extension**, using profiles/identifiers appropriate for the same team. A signing tool that removes `PlugIns`, or a profile that covers only the main app, cannot produce working widgets. No certificate or provisioning profile is committed to the repository. The current local implementation needs no push/App Group entitlement.

## Pending native acceptance

1. Compile/archive both targets and run `WidgetIntegrationTests` and `WidgetRouteTests` on iOS 18 and iOS 26. The archive checker must pass against the compiled app, not fixtures.
2. Add all five widget families through the system gallery; inspect standard/tinted/clear appearances, light/dark themes, VoiceOver and larger text. Verify each medium-widget link and cold/warm navigation with a draft present.
3. Exercise real recording, inference, speech preparation and playback, including Stop from an expanded island and from the Lock Screen. Verify no duplicate activities during speech handovers and no stale button cancelling a newer conversation.
4. Verify system Live Activities denial, the app toggle, manual dismissal, backgrounding, foreground return, process termination, stale UI and relaunch cleanup. Verify actual continued audio through locking/Home, Stop during background audio, audio interruptions and the final activity end when audio naturally finishes. Test actual signing/installation with the extension retained.

Apple references consulted on 2026-11-16:

- https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
- https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities
- https://developer.apple.com/documentation/appintents/liveactivityintent
- https://developer.apple.com/documentation/widgetkit/activityviewcontext/isstale
- https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time
