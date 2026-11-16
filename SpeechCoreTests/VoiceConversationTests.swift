import XCTest
#if canImport(MiraSpeechCore)
@testable import MiraSpeechCore
#else
@testable import Companion
#endif

final class VoiceConversationTests: XCTestCase {
    func testCaptureAndResponsePhasesNeverEnableSendingAnotherTurn() {
        for phase in [VoiceConversationPhase.authorizing, .listening, .finishing, .thinking, .preparing, .speaking] {
            XCTAssertFalse(phase.canSend("Новая реплика"))
        }
        XCTAssertFalse(VoiceConversationPhase.ready.canSend(" \n "))
        XCTAssertTrue(VoiceConversationPhase.ready.canSend(" Привет "))
    }
    func testFinalRecognitionTakesPriorityDuringMicrophoneHandover() {
        XCTAssertEqual(VoiceConversationPhase.current(authorizing: false, recording: true, finishing: true,
                                                      thinking: false, preparing: false, speaking: false), .finishing)
        XCTAssertEqual(VoiceConversationPhase.current(authorizing: true, recording: false, finishing: false,
                                                      thinking: false, preparing: false, speaking: false), .authorizing)
        XCTAssertEqual(VoiceConversationPhase.current(authorizing: false, recording: false, finishing: false,
                                                      thinking: true, preparing: false, speaking: true), .thinking)
        for phase in [VoiceConversationPhase.thinking, .preparing, .speaking] {
            XCTAssertTrue(phase.canInterrupt); XCTAssertFalse(phase.capturing)
        }
        XCTAssertFalse(VoiceConversationPhase.ready.canInterrupt)
        XCTAssertTrue(VoiceConversationPhase.finishing.capturing)
    }
    func testMeterUsesActualSilenceAndVoiceAcrossPartialBuffers() {
        var meter = MicrophoneMeter()
        let silence = [Float](repeating: 0, count: 500)
        XCTAssertNil(silence.withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: 10000) })
        XCTAssertEqual(silence.withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: 10000) }, 0)
        let voice = [Float](repeating: 0.1, count: 1000)
        let level = voice.withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: 10000) }
        XCTAssertEqual(level ?? -1, 35.0 / 45, accuracy: 0.00001)
        XCTAssertNil(silence.withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: 10000) })
        XCTAssertEqual(silence.withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: 10000) }, 0)
    }
    func testMeterHandlesInterleavedChannelsWithoutReadingTheOtherChannel() {
        var meter = MicrophoneMeter()
        let samples: [Float] = (0..<1000).flatMap { _ in [0, 1] }
        XCTAssertEqual(samples.withUnsafeBufferPointer { meter.consume($0, stride: 2, sampleRate: 10000) }, 0)
    }
    func testMeterRejectsInvalidFormatsAndNormalizesInvalidOrClippedSamples() {
        var meter = MicrophoneMeter()
        let samples: [Float] = [.nan, .infinity, -.infinity]
        XCTAssertNil(samples.withUnsafeBufferPointer { meter.consume($0, stride: 0, sampleRate: 10) })
        XCTAssertNil(samples.withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: .nan) })
        XCTAssertEqual(samples.withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: 10) }, 0)
        XCTAssertEqual([Float(10)].withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: 10) }, 1)
        XCTAssertEqual([Float(-10)].withUnsafeBufferPointer { meter.consume($0, stride: 1, sampleRate: 10) }, 1)
    }
}

@MainActor
private final class RecognitionGate {
    var started: XCTestExpectation?
    var waits: [CheckedContinuation<Void, Error>] = []
    func wait() async throws {
        try await withCheckedThrowingContinuation { continuation in
            waits.append(continuation); started?.fulfill()
        }
    }
    func resume(_ index: Int) { waits[index].resume() }
}

final class RecognitionDrainTests: XCTestCase {
    @MainActor
    func testTimeoutCompletesOnlyAfterRecognizerHasHadItsDrainWindow() async {
        let gate = RecognitionGate(), began = expectation(description: "waiting")
        gate.started = began
        let drain = RecognitionDrain(wait: { try await gate.wait() })
        var completed = false
        let finished = expectation(description: "finished")
        drain.begin { completed = true; finished.fulfill() }
        await fulfillment(of: [began], timeout: 2)
        XCTAssertFalse(completed)
        gate.resume(0)
        await fulfillment(of: [finished], timeout: 2)
        XCTAssertTrue(completed)
    }
    @MainActor
    func testFinalResultCancelsTimeoutEvenWhenItsWaitResumesLate() async {
        let gate = RecognitionGate(), began = expectation(description: "waiting")
        gate.started = began
        let drain = RecognitionDrain(wait: { try await gate.wait() })
        let obsolete = expectation(description: "no late finalization"); obsolete.isInverted = true
        drain.begin { obsolete.fulfill() }
        await fulfillment(of: [began], timeout: 2)
        drain.cancel(); gate.resume(0)
        await fulfillment(of: [obsolete], timeout: 0.05)
    }
    @MainActor
    func testOldTimeoutCannotFinishANewerRecording() async {
        let gate = RecognitionGate(), first = expectation(description: "old wait")
        gate.started = first
        let drain = RecognitionDrain(wait: { try await gate.wait() })
        var completions: [String] = []
        drain.begin { completions.append("old") }
        await fulfillment(of: [first], timeout: 2)
        let second = expectation(description: "new wait"), finished = expectation(description: "new finished")
        gate.started = second
        drain.begin { completions.append("new"); finished.fulfill() }
        await fulfillment(of: [second], timeout: 2)
        gate.resume(0); gate.resume(1)
        await fulfillment(of: [finished], timeout: 2)
        XCTAssertEqual(completions, ["new"])
    }
}
