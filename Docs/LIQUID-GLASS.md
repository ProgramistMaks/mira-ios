# Liquid Glass

Mira uses native SwiftUI Liquid Glass on iOS 26 and later. The project builds with Xcode 26.6 / iOS 26.5 SDK and keeps its iOS 18 deployment target.

- `App/GlassDesign.swift` scopes availability checks to presentation components. Custom surfaces use `.glassEffect(.regular, in:)`; actions use native `.glass` / `.glassProminent` button styles and circular borders. Grouped controls share a `GlassEffectContainer`.
- Header actions, microphone, send/stop, the input surface and character status use glass. The composer has three adjacent surfaces, without a second glass layer behind them. Button semantics, disabled states, focus and action handlers remain native.
- Settings, commands and model selection keep standard SwiftUI navigation, forms and lists, adopting the new SDK's system toolbar/sheet styling. Sheets retain native dismissal and expose a drag indicator. Content rows and conversation messages do not receive a glass coating.
- iOS 18 uses standard button styles and regular material, with an opaque surface when Reduce Transparency is enabled and a stronger outline for increased contrast. This is a compatibility presentation, not Liquid Glass on older systems.
- Native Liquid Glass handles system Reduce Transparency, Increase Contrast and Reduce Motion settings. Existing character Reduce Motion behavior remains intact. No custom shimmer, animation loop, shader, web imitation or motion permission is introduced.

CI defaults to macos-26-intel / Xcode 26.6 / iOS 26.5. This configuration compiled the complete device package and passed the startup, keyboard, notes, rotation and model-catalogue UI tests in run `43953994238`. The iOS 18.5 fallback remains selectable on a macOS 15 host with that runtime installed. The harness fails if the requested runtime is absent, boots one simulator, runs tests sequentially and bounds each test to twenty minutes. The successful iOS 18 CI UI scenario took 691 seconds, so the earlier ten-minute limit was too tight for this hosted environment.

Existing UI coverage exercises keyboard input, enabled/disabled sending and minimum 44-point control bounds. A recorded iOS 26 run loaded the character after the original sixty-second deadline, so cold-launch checks now allow 120 seconds while still requiring actual character pixels. A loading indicator makes that state visible to users. Model downloads use a native alert with explicit download/cancel actions because the iOS 26 confirmation popover omitted the implicit cancel action.

Visual review also found insufficient contrast in the iOS 18 send icon; prominent action icons now explicitly use the dark foreground against lavender. Those corrections now have passing iOS 26.5 UI assertions and internally reviewed screenshots. The run still failed its separate widget-route test and hit the overall job limit; see VERIFICATION.md for exact scope and the focused follow-up. Device appearance, startup speed and performance remain unverified.

Primary references:

- https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views
- https://developer.apple.com/documentation/swiftui/glass
- https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md
