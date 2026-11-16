import XCTest
import AVFoundation
import Combine
@testable import Companion

final class SpeechTests: XCTestCase {
    func testEnvelopeTracksSilenceAndVoiceAcrossBufferBoundaries() {
        var envelope = SpeechEnvelope()
        // Deliberately split windows like irregular AVSpeechSynthesizer buffers.
        for _ in 0..<441 { envelope.append(sample: 0, sampleRate: 22050) }
        for _ in 0..<441 { envelope.append(sample: 0.12, sampleRate: 22050) }
        for _ in 0..<441 { envelope.append(sample: 0, sampleRate: 22050) }
        envelope.finish()
        XCTAssertEqual(envelope.level(at: 0.01), 0)
        XCTAssertGreaterThan(envelope.level(at: 0.03), 0.3)
        XCTAssertEqual(envelope.level(at: 0.05), 0)
        XCTAssertEqual(envelope.level(at: -1), 0)
        XCTAssertEqual(envelope.level(at: .infinity), 0)
        XCTAssertEqual(envelope.level(at: 0.07), 0)
    }

    func testPCMFileRoundTripAndCancellationCleanup() throws {
        let session = SpeechRenderSession()
        let format = AVAudioFormat(standardFormatWithSampleRate: 22050, channels: 1)!
        let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 882)!
        pcm.frameLength = 882
        for index in 0..<882 { pcm.floatChannelData![0][index] = index < 441 ? 0 : 0.1 }
        XCTAssertNil(try session.consume(pcm))
        let end = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1)!
        let result = try XCTUnwrap(session.consume(end))
        let file = try AVAudioFile(forReading: result.url)
        XCTAssertEqual(file.length, 882)
        XCTAssertEqual(result.envelope.level(at: 0.01), 0)
        XCTAssertGreaterThan(result.envelope.level(at: 0.03), 0)
        session.cancel()
        XCTAssertFalse(FileManager.default.fileExists(atPath: result.url.path))
        XCTAssertNil(try session.consume(pcm), "Late callbacks after cancellation must not recreate the audio file")
        XCTAssertFalse(FileManager.default.fileExists(atPath: result.url.path))
    }

    @MainActor
    func testActualVoicePlaybackDrivesMouthAndStopsCleanly() async throws {
        let voice = VoiceService()
        var highestLevel = 0.0
        var failure: String?
        let subscription = voice.mouthEvents.sink { highestLevel = max(highestLevel, $0) }
        voice.onError = { failure = $0 }
        defer { voice.stop(); subscription.cancel() }
        let sample = String(repeating: "Привет. Я Мира. Рада тебя слышать. Давай поговорим. ", count: 3)
        try voice.say(sample, voiceID: "")
        let deadline = Date().addingTimeInterval(40)
        while highestLevel == 0 && failure == nil && Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertNil(failure)
        XCTAssertGreaterThan(highestLevel, 0, "Real synthesized audio must drive the mouth during actual playback")
        voice.setSceneActive(false)
        XCTAssertEqual(voice.mouthEvents.value, 0)
        try await Task.sleep(for: .milliseconds(250))
        XCTAssertTrue(voice.speaking, "Hiding the renderer must not stop already-playing speech")
        XCTAssertEqual(voice.mouthEvents.value, 0, "A hidden scene must not keep receiving mouth frames")
        highestLevel = 0
        voice.setSceneActive(true)
        let resumeDeadline = Date().addingTimeInterval(3)
        while highestLevel == 0 && voice.speaking && Date() < resumeDeadline {
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertGreaterThan(highestLevel, 0, "Returning to the scene must resume actual playback-derived mouth levels")
        voice.stop()
        XCTAssertFalse(voice.busy)
        XCTAssertEqual(voice.mouthEvents.value, 0)
        try await Task.sleep(for: .milliseconds(250))
        XCTAssertFalse(voice.busy, "Late synthesis callbacks must not restart playback after cancellation")
        XCTAssertEqual(voice.mouthEvents.value, 0)
        highestLevel = 0
        try voice.say("Привет!", voiceID: "")
        let finishDeadline = Date().addingTimeInterval(40)
        while voice.busy && failure == nil && Date() < finishDeadline {
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertNil(failure)
        XCTAssertGreaterThan(highestLevel, 0)
        XCTAssertFalse(voice.busy, "Playback completion must release the voice state")
        XCTAssertEqual(voice.mouthEvents.value, 0)
        try voice.say("Этот ответ отменён до начала воспроизведения.", voiceID: "")
        voice.stop()
        try await Task.sleep(for: .milliseconds(250))
        XCTAssertFalse(voice.busy)
        XCTAssertEqual(voice.mouthEvents.value, 0)
    }
}
