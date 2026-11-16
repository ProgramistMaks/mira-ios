import XCTest
#if canImport(MiraActivityCore)
@testable import MiraActivityCore
#else
@testable import Companion
#endif

@MainActor
private final class RecordingActivityDriver: MiraActivityDriver {
    enum Failure: Error { case unavailable }
    var authorized = true
    var failRequest = false
    var active: [String: MiraActivityPhase] = [:]
    var dismissed: Set<String> = []
    var requests: [(String, MiraActivityPhase)] = []
    var endings: [(String, MiraActivityPhase, Bool)] = []
    var maximumActive = 0
    var cleanups = 0
    var holdEnd = false
    var holdUpdate = false
    var endStarted: (() -> Void)?
    var updateStarted: (() -> Void)?
    var pendingEnd: CheckedContinuation<Void, Never>?
    var pendingUpdate: CheckedContinuation<Void, Never>?

    func removeOrphans() async { cleanups += 1 }
    func isDismissed(sessionID: String) -> Bool { dismissed.contains(sessionID) }
    func request(sessionID: String, startedAt: Date, phase: MiraActivityPhase) throws {
        if failRequest { throw Failure.unavailable }
        requests.append((sessionID, phase)); active[sessionID] = phase
        maximumActive = max(maximumActive, active.count)
    }
    func update(sessionID: String, phase: MiraActivityPhase) async {
        if holdUpdate {
            holdUpdate = false
            await withCheckedContinuation { pendingUpdate = $0; updateStarted?() }
        }
        active[sessionID] = phase
    }
    func end(sessionID: String, phase: MiraActivityPhase, immediately: Bool) async {
        if holdEnd {
            holdEnd = false
            await withCheckedContinuation { pendingEnd = $0; endStarted?() }
        }
        endings.append((sessionID, phase, immediately)); active.removeValue(forKey: sessionID)
    }
    func releaseEnd() { pendingEnd?.resume(); pendingEnd = nil }
    func releaseUpdate() { pendingUpdate?.resume(); pendingUpdate = nil }
}

final class MiraActivityLifecycleTests: XCTestCase {
    @MainActor
    private func start(_ phase: MiraActivityPhase = .thinking) async -> (MiraActivityLifecycle, RecordingActivityDriver) {
        let driver = RecordingActivityDriver(), lifecycle: MiraActivityLifecycle
        lifecycle = MiraActivityLifecycle(driver: driver)
        lifecycle.setForeground(true); lifecycle.beginInteraction()
        lifecycle.update(phase: phase, enabled: true)
        await lifecycle.waitForPendingOperations()
        return (lifecycle, driver)
    }

    @MainActor
    func testIdleLaunchCleansOrphansWithoutAdvertisingWork() async {
        let driver = RecordingActivityDriver(), lifecycle: MiraActivityLifecycle
        lifecycle = MiraActivityLifecycle(driver: driver)
        lifecycle.setForeground(true)
        await lifecycle.waitForPendingOperations()
        XCTAssertEqual(driver.cleanups, 1); XCTAssertTrue(driver.requests.isEmpty)
        XCTAssertFalse(lifecycle.wantsRefresh)
    }

    @MainActor
    func testThinkingPreparationAndPlaybackShareOneActivity() async {
        let (lifecycle, driver) = await start()
        let id = lifecycle.sessionID
        for phase in [MiraActivityPhase.preparing, .speaking] {
            lifecycle.update(phase: phase, enabled: true)
            await lifecycle.waitForPendingOperations()
            XCTAssertEqual(driver.active[id], phase)
        }
        XCTAssertEqual(driver.requests.count, 1)
        lifecycle.update(phase: nil, enabled: true)
        XCTAssertFalse(lifecycle.canStop(sessionID: id))
        await lifecycle.waitForPendingOperations()
        XCTAssertEqual(driver.endings.last?.1, .finished)
        XCTAssertEqual(driver.endings.last?.2, false)
        XCTAssertTrue(driver.active.isEmpty)
    }

    @MainActor
    func testOldStopBecomesInvalidBeforeSlowEndCompletes() async {
        let (lifecycle, driver) = await start()
        let old = lifecycle.sessionID, started = expectation(description: "old end began")
        driver.holdEnd = true; driver.endStarted = { started.fulfill() }
        lifecycle.finish()
        XCTAssertFalse(lifecycle.canStop(sessionID: old))
        lifecycle.beginInteraction(); lifecycle.update(phase: .listening, enabled: true)
        let new = lifecycle.sessionID
        await fulfillment(of: [started], timeout: 2)
        XCTAssertFalse(lifecycle.canStop(sessionID: old))
        XCTAssertFalse(lifecycle.canStop(sessionID: new))
        XCTAssertEqual(driver.requests.count, 1)
        driver.releaseEnd(); await lifecycle.waitForPendingOperations()
        XCTAssertTrue(lifecycle.canStop(sessionID: new))
        XCTAssertFalse(lifecycle.canStop(sessionID: old))
        XCTAssertEqual(driver.maximumActive, 1)
        XCTAssertEqual(driver.endings.first?.2, true)
    }

    @MainActor
    func testAThirdInteractionSupersedesOneWaitingForAnOldEnd() async {
        let (lifecycle, driver) = await start()
        let started = expectation(description: "end suspended")
        driver.holdEnd = true; driver.endStarted = { started.fulfill() }
        lifecycle.beginInteraction(); lifecycle.update(phase: .thinking, enabled: true)
        let skipped = lifecycle.sessionID
        await fulfillment(of: [started], timeout: 2)
        lifecycle.beginInteraction(); lifecycle.update(phase: .listening, enabled: true)
        let newest = lifecycle.sessionID
        driver.releaseEnd(); await lifecycle.waitForPendingOperations()
        XCTAssertFalse(driver.requests.contains { $0.0 == skipped })
        XCTAssertEqual(driver.active[newest], .listening)
        XCTAssertEqual(driver.requests.count, 2); XCTAssertEqual(driver.maximumActive, 1)
    }

    @MainActor
    func testDelayedUpdateCannotResurrectCancelledSpeech() async {
        let (lifecycle, driver) = await start()
        let old = lifecycle.sessionID, started = expectation(description: "update suspended")
        driver.holdUpdate = true; driver.updateStarted = { started.fulfill() }
        lifecycle.update(phase: .speaking, enabled: true)
        await fulfillment(of: [started], timeout: 2)
        lifecycle.finish()
        XCTAssertFalse(lifecycle.canStop(sessionID: old))
        driver.releaseUpdate(); await lifecycle.waitForPendingOperations()
        XCTAssertTrue(driver.active.isEmpty)
        XCTAssertEqual(driver.endings.last?.1, .stopped)
        XCTAssertEqual(driver.endings.last?.2, true)
        XCTAssertFalse(lifecycle.wantsRefresh)
    }

    @MainActor
    func testBackgroundSpeechKeepsItsActivityAndEndsOnActualCompletion() async {
        let (lifecycle, driver) = await start(.speaking)
        let id = lifecycle.sessionID
        lifecycle.setForeground(false, continuingSpeech: true)
        lifecycle.refresh(); await lifecycle.waitForPendingOperations()
        XCTAssertEqual(driver.active[id], .speaking)
        XCTAssertTrue(lifecycle.canStop(sessionID: id)); XCTAssertTrue(lifecycle.wantsRefresh)
        lifecycle.update(phase: nil, enabled: true)
        await lifecycle.waitForPendingOperations()
        XCTAssertTrue(driver.active.isEmpty)
        XCTAssertEqual(driver.endings.last?.1, .finished)
        XCTAssertFalse(lifecycle.wantsRefresh)
    }

    @MainActor
    func testBackgroundDoesNotCreateAnActivityOrResurrectMicrophoneAndInference() async {
        let driver = RecordingActivityDriver(), lifecycle: MiraActivityLifecycle
        lifecycle = MiraActivityLifecycle(driver: driver)
        lifecycle.setForeground(true); lifecycle.beginInteraction()
        lifecycle.update(phase: .speaking, enabled: true)
        lifecycle.setForeground(false, continuingSpeech: true) // before request was executed
        await lifecycle.waitForPendingOperations()
        XCTAssertTrue(driver.requests.isEmpty)
        for phase in [MiraActivityPhase.listening, .thinking, .preparing] {
            let (item, effects) = await start(phase)
            item.setForeground(false)
            item.update(phase: phase, enabled: true) // a late publisher delivery
            await item.waitForPendingOperations()
            XCTAssertTrue(effects.active.isEmpty)
            XCTAssertEqual(effects.endings.last?.1, .paused)
            XCTAssertEqual(effects.requests.count, 1)
        }
    }

    @MainActor
    func testStopFromBackgroundRemovesTheSpeakingActivity() async {
        let (lifecycle, driver) = await start(.speaking)
        lifecycle.setForeground(false, continuingSpeech: true)
        await lifecycle.waitForPendingOperations()
        lifecycle.finish(); await lifecycle.waitForPendingOperations()
        XCTAssertTrue(driver.active.isEmpty)
        XCTAssertEqual(driver.endings.last?.1, .stopped)
        XCTAssertEqual(driver.endings.last?.2, true)
    }

    @MainActor
    func testDismissalIsRespectedUntilAnExplicitNewInteraction() async {
        let (lifecycle, driver) = await start()
        let old = lifecycle.sessionID
        driver.dismissed.insert(old); driver.active.removeValue(forKey: old)
        lifecycle.refresh(); await lifecycle.waitForPendingOperations()
        lifecycle.update(phase: .speaking, enabled: true)
        lifecycle.setForeground(true); await lifecycle.waitForPendingOperations()
        XCTAssertEqual(driver.requests.count, 1)
        XCTAssertFalse(lifecycle.wantsRefresh)
        lifecycle.beginInteraction(); lifecycle.update(phase: .listening, enabled: true)
        await lifecycle.waitForPendingOperations()
        XCTAssertEqual(driver.requests.count, 2)
        XCTAssertFalse(lifecycle.canStop(sessionID: old))
    }

    @MainActor
    func testPreferenceAndSystemPermissionDisableUpdates() async {
        let (lifecycle, driver) = await start()
        lifecycle.update(phase: .thinking, enabled: false)
        await lifecycle.waitForPendingOperations()
        XCTAssertTrue(driver.active.isEmpty); XCTAssertEqual(driver.endings.last?.2, true)
        driver.authorized = false
        lifecycle.beginInteraction(); lifecycle.update(phase: .speaking, enabled: true)
        await lifecycle.waitForPendingOperations()
        XCTAssertEqual(driver.requests.count, 1)
        XCTAssertFalse(lifecycle.wantsRefresh)
    }

    @MainActor
    func testRequestFailureIsRecoverableWithoutFakeRunningState() async {
        let driver = RecordingActivityDriver(), lifecycle: MiraActivityLifecycle
        lifecycle = MiraActivityLifecycle(driver: driver)
        driver.failRequest = true
        lifecycle.setForeground(true); lifecycle.beginInteraction()
        lifecycle.update(phase: .thinking, enabled: true)
        await lifecycle.waitForPendingOperations()
        XCTAssertTrue(lifecycle.requestFailed); XCTAssertFalse(lifecycle.wantsRefresh)
        XCTAssertFalse(lifecycle.canStop(sessionID: lifecycle.sessionID))
        driver.failRequest = false
        lifecycle.beginInteraction(); lifecycle.update(phase: .thinking, enabled: true)
        await lifecycle.waitForPendingOperations()
        XCTAssertFalse(lifecycle.requestFailed); XCTAssertTrue(lifecycle.wantsRefresh)
    }

    @MainActor
    func testRapidPhaseChangesDoNotRequestObsoleteWork() async {
        let driver = RecordingActivityDriver(), lifecycle: MiraActivityLifecycle
        lifecycle = MiraActivityLifecycle(driver: driver)
        lifecycle.setForeground(true); lifecycle.beginInteraction()
        for phase in [MiraActivityPhase.thinking, .preparing, .speaking] {
            lifecycle.update(phase: phase, enabled: true)
        }
        await lifecycle.waitForPendingOperations()
        XCTAssertEqual(driver.requests.count, 1); XCTAssertEqual(driver.requests.first?.1, .speaking)
    }

    func testWidgetURLsOnlyNavigateToKnownScreens() {
        for route in MiraRoute.allCases { XCTAssertEqual(MiraRoute(url: route.url), route) }
        for value in ["https://chat", "mira://delete", "mira://chat/send", "mira://chat?text=hello",
                      "mira://chat#send", "mira://user@chat", "mira://chat:123", "mira:///chat"] {
            XCTAssertNil(MiraRoute(url: URL(string: value)!), value)
        }
    }
}
