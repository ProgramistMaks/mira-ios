import ActivityKit
import Foundation

struct MiraActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var phase: MiraActivityPhase
    }
    let sessionID: String
    let startedAt: Date
}
