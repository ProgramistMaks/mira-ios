import ActivityKit
import AppIntents

// LiveActivityIntent runs in the app process. The extension never opens the mic
// or loads inference weights. A session ID prevents an old button stopping a new turn.
@MainActor
enum MiraActivityActions {
    static var stop: ((String) -> Void)?
}

struct StopMiraActivityIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Остановить разговор с Мирой"
    static var description = IntentDescription("Останавливает текущую запись, ответ или озвучивание.")
    static var openAppWhenRun = false

    @Parameter(title: "Разговор") var sessionID: String
    init() {}
    init(sessionID: String) { self.sessionID = sessionID }

    @MainActor
    func perform() async throws -> some IntentResult {
        let activities = Activity<MiraActivityAttributes>.activities.filter { $0.attributes.sessionID == sessionID }
        MiraActivityActions.stop?(sessionID)
        for activity in activities {
            await activity.end(ActivityContent(state: .init(phase: .stopped), staleDate: nil),
                               dismissalPolicy: .immediate)
        }
        return .result()
    }
}
