import XCTest
#if canImport(MiraSpeechCore)
@testable import MiraSpeechCore
#else
@testable import Companion
#endif

@MainActor
private final class MouthReceiver {
    var time = 1_000.0
    var frames: [MouthFrame] = []
    var acknowledgements: [@MainActor () -> Void] = []
    func bridge() -> MouthBridge {
        MouthBridge(now: { self.time }) { frame, done in
            self.frames.append(frame); self.acknowledgements.append(done)
        }
    }
}

final class MouthBridgeTests: XCTestCase {
    @MainActor
    func testSamplesWaitForReadinessAndOnlyOneLatestSampleSurvivesBackpressure() async {
        let receiver = MouthReceiver(), bridge = receiver.bridge()
        bridge.submit(0.8)
        XCTAssertTrue(receiver.frames.isEmpty)
        bridge.setState(ready: true, active: true)
        XCTAssertEqual(receiver.frames.count, 1)
        for index in 1...100 { bridge.submit(Double(index) / 100) }
        XCTAssertEqual(receiver.frames.count, 1, "No JavaScript evaluation per queued sample")
        receiver.acknowledgements[0]()
        XCTAssertEqual(receiver.frames.count, 2)
        XCTAssertEqual(receiver.frames[1].level, 1)
        receiver.acknowledgements[1]()
        XCTAssertEqual(receiver.frames.count, 2, "Intermediate samples were replaced, not queued")
    }

    @MainActor
    func testSampleAgingWhileJavaScriptIsBusyBecomesSilence() async {
        let receiver = MouthReceiver(), bridge = receiver.bridge()
        bridge.setState(ready: true, active: true)
        receiver.time += 20; bridge.submit(0.8)
        receiver.time += 181; receiver.acknowledgements[0]()
        XCTAssertEqual(receiver.frames.last?.level, 0)
        XCTAssertEqual(receiver.frames.last?.sampledAt, receiver.time)
    }

    @MainActor
    func testClockReversalCannotMakeAnOldSampleFresh() async {
        let receiver = MouthReceiver(), bridge = receiver.bridge()
        bridge.setState(ready: true, active: true); bridge.submit(0.8)
        receiver.time -= 50; receiver.acknowledgements[0]()
        XCTAssertEqual(receiver.frames.last?.level, 0)
    }

    @MainActor
    func testHiddenSceneClearsPendingSpeechAndRejectsNewSamplesUntilVisible() async {
        let receiver = MouthReceiver(), bridge = receiver.bridge()
        bridge.setState(ready: true, active: true); bridge.submit(0.8)
        bridge.setState(ready: true, active: false)
        bridge.submit(1)
        receiver.acknowledgements[0]()
        XCTAssertEqual(receiver.frames.last?.level, 0)
        receiver.acknowledgements[1]()
        let count = receiver.frames.count
        bridge.submit(0.7); bridge.setState(ready: true, active: false)
        XCTAssertEqual(receiver.frames.count, count)
        bridge.setState(ready: true, active: true)
        XCTAssertEqual(receiver.frames.last?.level, 0, "Visibility must not replay a cached mouth pose")
        bridge.submit(0.6); receiver.acknowledgements[count]()
        XCTAssertEqual(receiver.frames.last?.level, 0.6)
    }

    @MainActor
    func testOldDocumentAcknowledgementCannotReleaseNewDocumentsPendingSample() async {
        let receiver = MouthReceiver(), bridge = receiver.bridge()
        bridge.setState(ready: true, active: true)
        bridge.submit(0.9); bridge.reset()
        bridge.setState(ready: true, active: true); bridge.submit(0.4)
        XCTAssertEqual(receiver.frames.count, 2)
        receiver.acknowledgements[0]()
        XCTAssertEqual(receiver.frames.count, 2)
        receiver.acknowledgements[1]()
        XCTAssertEqual(receiver.frames.count, 3)
        XCTAssertEqual(receiver.frames.last?.level, 0.4)
        XCTAssertGreaterThan(receiver.frames[1].sequence, receiver.frames[0].sequence)
    }

    @MainActor
    func testInvalidLevelsAreSanitizedAndStopReplacesPendingOpenMouth() async {
        let receiver = MouthReceiver(), bridge = receiver.bridge()
        bridge.setState(ready: true, active: true)
        for level in [Double.nan, .infinity, -.infinity, -1] {
            bridge.submit(level); receiver.acknowledgements.last?()
            XCTAssertEqual(receiver.frames.last?.level, 0)
        }
        bridge.submit(2); receiver.acknowledgements.last?()
        XCTAssertEqual(receiver.frames.last?.level, 1)
        bridge.submit(0.8); bridge.submit(0); receiver.acknowledgements.last?()
        XCTAssertEqual(receiver.frames.last?.level, 0)
        XCTAssertTrue(receiver.frames.allSatisfy { $0.level.isFinite && $0.sampledAt.isFinite })
    }

    @MainActor
    func testSynchronousDeliveryAndRepeatedStateUpdatesDoNotCreateExtraWork() async {
        var frames: [MouthFrame] = []
        let bridge = MouthBridge(now: { 1_000 }) { frame, done in frames.append(frame); done() }
        bridge.setState(ready: true, active: true)
        for _ in 0..<100 { bridge.setState(ready: true, active: true) }
        XCTAssertEqual(frames.count, 1)
        bridge.submit(0.5); bridge.submit(0)
        XCTAssertEqual(frames.map(\.level), [0, 0.5, 0])
    }
}
