import ActivityKit
import Combine
import UIKit

@MainActor
final class MiraLiveActivityController: ObservableObject {
    @Published private(set) var issue: String?
    private var activity: Activity<MiraActivityAttributes>?
    private var phase: MiraActivityPhase?
    private var ending: MiraActivityPhase = .finished
    private var enabled = true
    private var foreground = false
    private var backgroundPlayback = false
    private var dismissed = false
    private var revision = 0
    private var operation: Task<Void, Never>?
    private var heartbeat: Task<Void, Never>?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    init() {
        // Capture only orphaned activities, never one created later in this process.
        let orphaned = Activity<MiraActivityAttributes>.activities
        operation = Task {
            for item in orphaned {
                await item.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    func matches(sessionID: String) -> Bool { activity?.attributes.sessionID == sessionID }

    func update(phase: MiraActivityPhase?, enabled: Bool) {
        let phase = foreground ? phase : (backgroundPlayback && phase == .speaking ? .speaking : nil)
        if !foreground && phase == nil { backgroundPlayback = false }
        guard self.phase != phase || self.enabled != enabled else { return }
        self.enabled = enabled
        if phase != nil && self.phase == nil { ending = .finished }
        self.phase = phase
        if phase == nil { dismissed = false }
        if !foreground && phase == nil { beginBackgroundTask() }
        enqueue()
    }

    func finish() {
        phase = nil; ending = .stopped; dismissed = false; backgroundPlayback = false
        if !foreground { beginBackgroundTask() }
        enqueue()
    }

    func setForeground(_ value: Bool, continuingSpeech: Bool = false) {
        foreground = value
        backgroundPlayback = !value && continuingSpeech
        if value { endBackgroundTask() }
        else if backgroundPlayback {
            phase = .speaking; ending = .finished
        } else {
            phase = nil; ending = .paused
            beginBackgroundTask()
        }
        enqueue()
    }

    private func enqueue() {
        revision += 1
        let expected = revision, previous = operation
        operation = Task { [weak self] in
            await previous?.value
            guard let self, self.revision == expected else { return }
            await self.reconcile()
        }
    }

    private func reconcile() async {
        guard enabled, let phase, (foreground || (backgroundPlayback && phase == .speaking)), !dismissed,
              ActivityAuthorizationInfo().areActivitiesEnabled else {
            heartbeat?.cancel(); heartbeat = nil
            if let activity {
                self.activity = nil
                let final = ActivityContent(state: MiraActivityAttributes.ContentState(phase: ending), staleDate: nil)
                await activity.end(final, dismissalPolicy: enabled && ending != .stopped ? .after(Date().addingTimeInterval(45)) : .immediate)
            }
            endBackgroundTask()
            return
        }
        if let activity, activity.activityState == .dismissed || activity.activityState == .ended {
            self.activity = nil; dismissed = true
            heartbeat?.cancel(); heartbeat = nil
            return // Respect a person's dismissal for the rest of this interaction.
        }
        let content = ActivityContent(state: MiraActivityAttributes.ContentState(phase: phase),
                                      staleDate: Date().addingTimeInterval(90))
        if let activity {
            await activity.update(content)
        } else {
            // ActivityKit can update an existing activity during audible playback,
            // but a normal app cannot request a new one while backgrounded.
            guard foreground else { return }
            do {
                activity = try Activity.request(attributes: MiraActivityAttributes(sessionID: UUID().uuidString,
                                                                                  startedAt: Date()),
                                                content: content, pushType: nil)
                issue = nil
            } catch {
                issue = "Не удалось показать состояние разговора. Проверь разрешение Live Activities в настройках iPhone."
                return
            }
        }
        if heartbeat == nil {
            heartbeat = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(30)) } catch { return }
                    guard let self else { return }
                    self.enqueue()
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
