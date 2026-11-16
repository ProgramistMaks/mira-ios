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

Stopping, backgrounding or audio interruption cancels synthesis, playback and the
clock, resets the mouth and deletes the temporary audio. Playback completion does
the same. Preparation times out after 45 seconds. Whole-utterance preparation adds
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
