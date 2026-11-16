# Speech playback and character synchronization

## Voice conversation mode

“Разговор голосом” opens a larger character scene and a scrollable voice panel in
the same conversation. Entering the mode does not start recording, request a model
answer or send an existing draft. The panel shows the current phase, an editable
utterance, explicit Send, the latest answer and Replay for completed replies only.
Send requests spoken output for that turn without modifying the general speech
preference. Partial/interrupted replies are not replayable or automatically spoken.

“Перебить и говорить” cancels inference/speech, preserves the partial answer and
starts a new microphone request after playback stops. There is also Stop without
starting recording. “В текст” stops capture/finalization, retains the draft and
focuses the text composer. Settings/command navigation also closes recording;
headphone/device disconnection cancels active work. Backgrounding and audio
interruptions retain the existing cancellation policy. The microphone does not
automatically reopen after an answer. This is deliberate turn-taking, not wake-word
detection, full-duplex speech or automatic silence-triggered sending.

The microphone meter computes RMS from the actual first input channel in 100 ms
windows, handles interleaved PCM stride and publishes only normalized numeric
levels. The meter view subscribes independently instead of publishing a level on
the whole screen's observable voice state. No microphone recording file is created.

“Закончить фразу” closes the audio engine/tap immediately and calls `endAudio`,
allowing recognition to return its final revision for at most two seconds. Send
and editing remain disabled while finishing. “Оставить текущий текст” cancels that
wait and retains the latest transcript. A final result, cancellation or a new
recording invalidates the old timeout; late recognition callbacks are generation
checked. This reduces truncated endings but cannot guarantee every word is
recognized. The existing 55-second capture limit uses the same finishing path.

Local inference mode still requires on-device speech recognition. Cloud mode
discloses possible Apple recognition and selected-provider text processing.
Recognized commands still open their existing confirmation forms before execution.
Successful commands submitted from voice mode speak their actual result; cancelled
or failed actions do not get a success announcement. Capture permits a Bluetooth
hands-free input route; actual headset route selection and latency remain untested.
No new provider, paid speech API, auto-send or background microphone is introduced.

Portable tests cover phase/action gating, meter silence/voice/stride/invalid PCM,
recognition timeout cancellation and replacement. A native UI case covers entering
voice mode without recording, draft preservation, explicit command review and
returning from settings. Actual microphone permissions, final recognition delivery,
Bluetooth, native layout/accessibility and interruption behavior require iOS/device
verification; test source alone is not evidence that those paths have passed.

## Dictation and permissions

Starting dictation snapshots the existing draft. Each recognition revision is combined
with that snapshot, so a revised partial result replaces the previous recognized
portion without duplicating words or erasing typed text. An empty/no-speech result
retains the original draft. Final recognized text is applied synchronously before
the recording session is released. During permission setup and recording the composer
cannot be edited or sent; the microphone control becomes Cancel/Stop. Nothing is
automatically sent when dictation ends.

Permission setup has a visible pending state. The shared authorization gate validates
the current request after every asynchronous reply: cancellation, backgrounding or a
newer request prevents a late response from continuing to the next permission prompt
or authorizing recording. Denying speech permission does not ask for microphone
access. Cancellation does not programmatically dismiss a system permission sheet
already on screen; it invalidates the pending operation. The voice service additionally
checks its own generation and task cancellation before touching the audio engine.

Nine portable Swift tests pass for permission cancellation/denial/retry, overlapping
requests, recognition revisions, whitespace and subsequent dictation. Actual iOS
permission sheets, microphone capture and the updated composer still await native
verification. During device review, cover cancelling or backgrounding at each prompt,
denial followed by retry, dictation into a nonempty draft, revised recognition and
stop followed by editing/sending. System audio interruptions cancel only on `.began`;
a late `.ended` notification must not cancel newly started work.

## Playback

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
state, and expires bridge samples 180 ms after capture, including delivery delay. There is no random speech
oscillator. Reduced Motion still permits speech feedback.

`MouthBridge` permits one JavaScript evaluation in flight per document, retaining
only the newest pending amplitude. Completion releases that slot; old-document
callbacks cannot release a newer document's slot. Stop replaces pending speech
with zero. A timestamp and increasing sequence accompany each sample: stale,
future, reordered or duplicate packets cannot revive an old mouth pose. JavaScript
converts capture age to a monotonic expiry after receipt. Phase/visibility changes
discard cached samples. No speech text or audio files cross this bridge.

The scene-active signal now cancels the mouth clock and sends a closed-mouth value
while the view is inactive, hidden behind a sheet, loading or recovering its WebView,
without stopping already-playing audio. The avatar coordinator resumes the clock
only when the scene is ready and visible. Returning to
the scene restarts sampling at `AVAudioPlayer.currentTime`, not at the start of the
utterance. Stop releases the player before deactivating the shared audio session.
The native playback test now exercises visibility suspension/resumption, but this
new test and the changed audio integration still await Xcode/device validation.

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
- Seven portable bridge tests cover a blocked consumer, latest-sample replacement,
  stop, visibility, clock reversal, expired samples and obsolete acknowledgements.
  Five additional renderer cases exercise timestamps, ordering and phase/visibility
  invalidation. A Chromium probe uses the production renderer with a test-only
  read-only expression accessor to verify actual VRM mouth weights under fresh,
  expired, delayed and reordered delivery, stop, phase changes and hide/resume.
  This does not validate WKWebView delivery or device audio latency.
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
