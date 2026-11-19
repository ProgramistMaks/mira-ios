import XCTest
#if canImport(MiraSpeechCore)
@testable import MiraSpeechCore
#else
@testable import Companion
#endif

final class AutomaticConversationTests: XCTestCase {
    func testSilenceAndPartialRecognitionNeverSendPrematurelyOrTwice() {
        var endpoint = SpeechEndpoint()
        XCTAssertFalse(endpoint.shouldFinish(at: 100))
        endpoint.transcript("Найди", at: 101)
        endpoint.level(0.8, at: 102)
        XCTAssertFalse(endpoint.shouldFinish(at: 102.5))
        endpoint.transcript("Найди погоду", at: 102.6)
        XCTAssertFalse(endpoint.shouldFinish(at: 103.8))
        XCTAssertTrue(endpoint.shouldFinish(at: 104))
        XCTAssertFalse(endpoint.shouldFinish(at: 105))
    }
    func testRepeatedTextAndInvalidSamplesDoNotKeepPhraseOpen() {
        var endpoint = SpeechEndpoint()
        endpoint.transcript("Привет", at: 1)
        endpoint.transcript("Привет", at: 2)
        endpoint.level(.infinity, at: 2)
        endpoint.level(1, at: .nan)
        XCTAssertTrue(endpoint.shouldFinish(at: 2.4))
    }
    func testPlaybackMustFinishBeforeNextMicrophoneTurn() {
        var session = AutomaticConversation()
        let id = session.start()
        XCTAssertTrue(session.heard("Привет", session: id))
        XCTAssertFalse(session.heard("Дубликат", session: id))
        XCTAssertFalse(session.finishedSpeaking(session: id))
        XCTAssertTrue(session.willSpeak(session: id))
        XCTAssertTrue(session.finishedSpeaking(session: id))
        XCTAssertFalse(session.finishedSpeaking(session: id))
        XCTAssertEqual(session.phase, .listening)
    }
    func testStopAndRestartRejectEveryCallbackFromOldConversation() {
        var session = AutomaticConversation()
        let old = session.start()
        XCTAssertTrue(session.heard("Привет", session: old))
        XCTAssertTrue(session.willSpeak(session: old))
        session.stop()
        XCTAssertFalse(session.finishedSpeaking(session: old))
        let new = session.start()
        XCTAssertNotEqual(new, old)
        XCTAssertFalse(session.heard("Поздний текст", session: old))
        XCTAssertFalse(session.willSpeak(session: old))
        XCTAssertFalse(session.finishedSpeaking(session: old))
        XCTAssertEqual(session.phase, .listening)
    }
}
