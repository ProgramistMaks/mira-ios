# Liquid Glass

Mira uses native SwiftUI Liquid Glass on iOS 26 and later. The project builds with Xcode 26.2 / iOS 26.2 SDK and keeps its iOS 18 deployment target.

- `App/GlassDesign.swift` scopes availability checks to presentation components. Custom surfaces use `.glassEffect(.regular, in:)`; actions use native `.glass` / `.glassProminent` button styles and circular borders. Grouped controls share a `GlassEffectContainer`.
- Header actions, microphone, send/stop, the input surface and character status use glass. The composer has three adjacent surfaces, without a second glass layer behind them. Button semantics, disabled states, focus and action handlers remain native.
- Settings, commands and model selection keep standard SwiftUI navigation, forms and lists, adopting the new SDK's system toolbar/sheet styling. Sheets retain native dismissal and expose a drag indicator. Content rows and conversation messages do not receive a glass coating.
- iOS 18 uses standard button styles and regular material, with an opaque surface when Reduce Transparency is enabled and a stronger outline for increased contrast. This is a compatibility presentation, not Liquid Glass on older systems.
- Native Liquid Glass handles system Reduce Transparency, Increase Contrast and Reduce Motion settings. Existing character Reduce Motion behavior remains intact. No custom shimmer, animation loop, shader, web imitation or motion permission is introduced.

CI explicitly selects iOS 26.2 for the native effect, or iOS 18.5 for the fallback. It fails if the requested runtime is absent instead of silently testing the wrong OS. Existing UI coverage also exercises keyboard input, enabled/disabled sending and minimum 44-point control bounds. Actual results and review are recorded in VERIFICATION.md; device appearance and performance remain unverified.

Primary references:

- https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views
- https://developer.apple.com/documentation/swiftui/glass
- https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md
