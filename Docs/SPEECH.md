# Speech playback and character synchronization

Apple's `AVSpeechSynthesizer.write(_:toBufferCallback:)` produces actual PCM audio.
`SpeechRenderSession` writes it to a temporary CAF file and computes an RMS mouth
opening every 20 ms. It serializes callback/file access, caps speech at three minutes,
and ignores callbacks after cancellation. PCM buffers are consumed before the callback
returns; they are not retained or queued on the main actor.

`VoiceService` shows preparation separately from playback. Once synthesis finishes,
`AVAudioPlayer` plays the same file. A 30 Hz task reads the player's currentTime and
sends the corresponding amplitude through a dedicated Combine subject to WKWebView.
These samples do not trigger whole-screen SwiftUI updates and contain no transcript
or credentials. The renderer smooths mouth opening, closes it outside the speaking
state, and expires missing bridge updates after 180 ms. There is no random speech
oscillator. Reduced Motion still permits speech feedback.

Stopping or audio interruption cancels synthesis, playback and the clock, resets
the mouth and deletes the temporary audio. Playback completion does the same.
The widget/island update declares background audio: already-playing speech may
continue while backgrounded or locked, with an ActivityKit Stop control. Recording,
inference and speech preparation still cancel on backgrounding. This new background
behavior awaits native/device verification; earlier speech tests do not certify it.
Preparation times out after 45 seconds. Whole-utterance preparation adds
latency; streaming playback is a future improvement, not claimed here.

This is audio-amplitude synchronization, **not phoneme recognition or finished lip
sync**. Vowel/consonant shapes, Bluetooth latency and actual-device timing remain
unverified. The same installed Apple voice is used in local and cloud chat modes;
this does not claim the voice quality demonstrated in the reference videos.

## Verification

- Native tests cover silence/voice boundaries, PCM file output, cancellation cleanup,
  and actual synthesis/playback followed by stop, natural completion and early cancel.
- Renderer tests cover silence, absent audio, stale/invalid amplitude and Reduced Motion.
- The native CI result and screenshot review are recorded in VERIFICATION.md.

## API sources

- https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/write(_:tobuffercallback:)
- https://developer.apple.com/documentation/avfaudio/avaudioplayer/currenttime

## Phoneme metadata probe — no phoneme data from tested voices

Apple documents `write(_:toBufferCallback:toMarkerCallback:)` from iOS 16 / macOS 13. `AVSpeechSynthesisMarker` can describe phonemes and byte offsets in audio. That API is available at this project's deployment target, but documentation alone does not establish that installed Russian system voices emit useful phoneme events.

The isolated macOS probe in run `43834797647` (source `02cfe82`) completed successfully using synthetic text:

| Installed voice | PCM frames / rate | Markers | Phonemes |
| --- | --- | --- | --- |
| Milena, ru-RU, compact | 93,649 / 22,050 Hz | 0 | 0 |
| Samantha, en-US, compact | 52,408 / 22,050 Hz | 0 | 0 |

Both voices returned nonempty PCM and a final zero-length buffer; neither supplied markers. Thus this probe does **not** justify implementing or claiming phoneme synchronization. It describes these two installed macOS voices, not every iOS voice or speech provider. The reproducible diagnostic is `Scripts/probe-speech-markers.swift` with a separate manually triggered workflow.

Before replacing amplitude-only mouth control, verify a source that actually supplies phonemes, its offset origin/format, ordering relative to PCM callbacks and behavior on cancellation. Do not fabricate phoneme timing from animation loops or claim phoneme lip sync before this is verified.

- https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/write(_:tobuffercallback:tomarkercallback:)
- https://developer.apple.com/documentation/avfaudio/avspeechsynthesismarker
- https://developer.apple.com/documentation/avfaudio/avspeechsynthesismarker/bytesampleoffset
