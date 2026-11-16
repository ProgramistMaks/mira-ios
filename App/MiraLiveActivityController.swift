import ActivityKit
import Combine
import UIKit

@MainActor
final class MiraLiveActivityController: ObservableObject {
    @Published private(set) var issue: String?
    private let lifecycle = MiraActivityLifecycle(driver: SystemActivityDriver())
    private var foreground = false
    private var heartbeat: Task<Void, Never>?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    init() { lifecycle.didReconcile = { [weak self] in self?.didReconcile() } }
    func matches(sessionID: String) -> Bool { lifecycle.canStop(sessionID: sessionID) }
    func beginInteraction() { lifecycle.beginInteraction() }

    func update(phase: MiraActivityPhase?, enabled: Bool) {
        if !foreground && (phase == nil || !enabled) && lifecycle.hasActivity { beginBackgroundTask() }
        lifecycle.update(phase: phase, enabled: enabled)
    }
    func finish() {
        if !foreground && lifecycle.hasActivity { beginBackgroundTask() }
        lifecycle.finish()
    }
    func setForeground(_ value: Bool, continuingSpeech: Bool = false) {
        foreground = value
        if value { endBackgroundTask() }
        else if !continuingSpeech && lifecycle.hasActivity { beginBackgroundTask() }
        lifecycle.setForeground(value, continuingSpeech: continuingSpeech)
    }

    private func didReconcile() {
        issue = lifecycle.requestFailed
            ? "Не удалось показать состояние разговора. Проверь разрешение Live Activities в настройках iPhone."
            : nil
        guard lifecycle.wantsRefresh else {
            heartbeat?.cancel(); heartbeat = nil
            endBackgroundTask()
            return
        }
        if heartbeat == nil {
            heartbeat = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(30)) } catch { return }
                    guard let self else { return }
                    self.lifecycle.refresh()
                }
            }
        }
    }

    private func beginBackgroundTask() {
        guard backgroundTask == .invalid else { return }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Finish Mira activity") { [weak self] in
            Task { @MainActor in self?.endBackgroundTask() }
        }
    }
    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask); backgroundTask = .invalid
    }
}

/// The only platform adapter. Tests replace effects, never the lifecycle decisions.
@MainActor
private final class SystemActivityDriver: MiraActivityDriver {
    private var activities: [String: Activity<MiraActivityAttributes>] = [:]
    private let orphaned = Activity<MiraActivityAttributes>.activities
    var authorized: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }
    func removeOrphans() async {
        for activity in orphaned { await activity.end(nil, dismissalPolicy: .immediate) }
    }
    func isDismissed(sessionID: String) -> Bool {
        guard let activity = activities[sessionID] else { return true }
        let dismissed = activity.activityState == .dismissed || activity.activityState == .ended
        if dismissed { activities.removeValue(forKey: sessionID) }
        return dismissed
    }
    func request(sessionID: String, startedAt: Date, phase: MiraActivityPhase) throws {
        activities[sessionID] = try Activity.request(
            attributes: MiraActivityAttributes(sessionID: sessionID, startedAt: startedAt),
            content: content(phase), pushType: nil)
    }
    func update(sessionID: String, phase: MiraActivityPhase) async {
        await activities[sessionID]?.update(content(phase))
    }
    func end(sessionID: String, phase: MiraActivityPhase, immediately: Bool) async {
        guard let activity = activities.removeValue(forKey: sessionID) else { return }
        await activity.end(ActivityContent(state: .init(phase: phase), staleDate: nil),
                           dismissalPolicy: immediately ? .immediate : .after(Date().addingTimeInterval(45)))
    }
    private func content(_ phase: MiraActivityPhase) -> ActivityContent<MiraActivityAttributes.ContentState> {
        ActivityContent(state: .init(phase: phase), staleDate: Date().addingTimeInterval(90))
    }
}
