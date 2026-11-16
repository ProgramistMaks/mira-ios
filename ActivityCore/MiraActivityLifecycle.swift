import Foundation

/// Platform effects are injected so delayed updates/end calls can be tested without
/// pretending to run ActivityKit outside iOS. All decisions stay on the main actor.
@MainActor
protocol MiraActivityDriver: AnyObject {
    var authorized: Bool { get }
    func removeOrphans() async
    func isDismissed(sessionID: String) -> Bool
    func request(sessionID: String, startedAt: Date, phase: MiraActivityPhase) throws
    func update(sessionID: String, phase: MiraActivityPhase) async
    func end(sessionID: String, phase: MiraActivityPhase, immediately: Bool) async
}

@MainActor
final class MiraActivityLifecycle {
    private let driver: MiraActivityDriver
    private(set) var sessionID = UUID().uuidString
    private var startedAt = Date()
    private var currentSession: String?
    private var phase: MiraActivityPhase?
    private var ending: MiraActivityPhase = .finished
    private var enabled = true
    private var foreground = false
    private var backgroundPlayback = false
    private var dismissed = false
    private var revision = 0
    private var operation: Task<Void, Never>?
    private(set) var requestFailed = false
    var didReconcile: (() -> Void)?

    init(driver: MiraActivityDriver) {
        self.driver = driver
        operation = Task { await driver.removeOrphans() }
    }

    var wantsRefresh: Bool {
        eligible && driver.authorized && currentSession == sessionID && !driver.isDismissed(sessionID: sessionID)
    }
    var hasActivity: Bool { currentSession != nil }
    private var eligible: Bool {
        enabled && !dismissed && phase != nil && (foreground || (backgroundPlayback && phase == .speaking))
    }
    func canStop(sessionID: String) -> Bool {
        // Do not depend solely on a system activity that may still be ending.
        sessionID == self.sessionID && currentSession == sessionID && phase?.isRunning == true
    }

    func beginInteraction() {
        sessionID = UUID().uuidString; startedAt = Date()
        phase = nil; ending = .stopped; dismissed = false; backgroundPlayback = false
        requestFailed = false
        enqueue()
    }

    func update(phase: MiraActivityPhase?, enabled: Bool) {
        let phase = foreground ? phase : (backgroundPlayback && phase == .speaking ? .speaking : nil)
        if !foreground && phase == nil { backgroundPlayback = false }
        guard self.phase != phase || self.enabled != enabled else { return }
        self.enabled = enabled
        if phase != nil && self.phase == nil { ending = .finished }
        self.phase = phase
        if phase == nil { dismissed = false }
        enqueue()
    }

    func finish() {
        phase = nil; ending = .stopped; dismissed = false; backgroundPlayback = false
        enqueue()
    }

    func setForeground(_ value: Bool, continuingSpeech: Bool = false) {
        foreground = value
        backgroundPlayback = !value && continuingSpeech
        if backgroundPlayback { phase = .speaking; ending = .finished }
        else if !value { phase = nil; ending = .paused }
        enqueue()
    }

    func refresh() { enqueue() }

    // A deterministic barrier for tests and callers that need all queued effects.
    func waitForPendingOperations() async { await operation?.value }

    private func enqueue() {
        revision += 1
        let expected = revision, previous = operation
        operation = Task { [weak self] in
            await previous?.value
            guard let self, self.revision == expected else { return }
            await self.reconcile(revision: expected)
            self.didReconcile?()
        }
    }

    private func reconcile(revision expected: Int) async {
        if let old = currentSession, old != sessionID {
            currentSession = nil
            await driver.end(sessionID: old, phase: .stopped, immediately: true)
            guard revision == expected else { return }
        }
        guard eligible, driver.authorized, let phase else {
            if let old = currentSession {
                currentSession = nil
                await driver.end(sessionID: old, phase: ending, immediately: !enabled || ending == .stopped)
            }
            return
        }
        if let currentSession, driver.isDismissed(sessionID: currentSession) {
            self.currentSession = nil; dismissed = true
            return
        }
        if let currentSession {
            await driver.update(sessionID: currentSession, phase: phase)
        } else {
            guard foreground else { return } // ActivityKit forbids a normal background request.
            do {
                try driver.request(sessionID: sessionID, startedAt: startedAt, phase: phase)
                currentSession = sessionID; requestFailed = false
            } catch { requestFailed = true }
        }
    }
}
