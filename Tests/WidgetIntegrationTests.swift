import XCTest
@testable import Companion

final class WidgetIntegrationTests: XCTestCase {
    func testLiveActivityUsesActualWorkAndEndsWhenIdle() {
        XCTAssertNil(MiraActivityPhase.current(thinking: false, recording: false, preparing: false, speaking: false))
        XCTAssertEqual(MiraActivityPhase.current(thinking: false, recording: true, preparing: false, speaking: false), .listening)
        XCTAssertEqual(MiraActivityPhase.current(thinking: true, recording: false, preparing: false, speaking: false), .thinking)
        XCTAssertEqual(MiraActivityPhase.current(thinking: false, recording: false, preparing: true, speaking: false), .preparing)
        XCTAssertEqual(MiraActivityPhase.current(thinking: false, recording: false, preparing: false, speaking: true), .speaking)
        XCTAssertEqual(MiraActivityPhase.current(thinking: true, recording: false, preparing: true, speaking: true), .thinking)
        XCTAssertFalse(MiraActivityPhase.paused.isRunning)
        XCTAssertFalse(MiraActivityPhase.stopped.isRunning)
        XCTAssertFalse(MiraActivityPhase.finished.isRunning)
    }

    func testExistingSettingsAndActivityPreferenceRoundTrip() throws {
        let old = Data(#"{"baseURL":"","model":"","voiceID":"","speakReplies":true}"#.utf8)
        var settings = try JSONDecoder().decode(ConnectionSettings.self, from: old)
        XCTAssertTrue(settings.liveActivitiesEnabled ?? true)
        settings.liveActivitiesEnabled = false
        let restored = try JSONDecoder().decode(ConnectionSettings.self, from: JSONEncoder().encode(settings))
        XCTAssertEqual(restored.liveActivitiesEnabled, false)
    }

    func testLockScreenPayloadContainsOnlyState() throws {
        let state = MiraActivityAttributes.ContentState(phase: .thinking)
        let data = try JSONEncoder().encode(state)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
        XCTAssertEqual(payload, ["phase": "thinking"])
        XCTAssertEqual(try JSONDecoder().decode(MiraActivityAttributes.ContentState.self, from: data), state)
    }
}
