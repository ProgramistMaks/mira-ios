import Foundation

/// Recognition revises the entire current utterance. Always combine it with the
/// original draft, rather than appending each partial result to the last one.
struct MiraDictationDraft {
    let original: String
    func applying(_ transcript: String) -> String {
        let speech = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !speech.isEmpty else { return original }
        let separator = original.isEmpty || original.last?.isWhitespace == true ? "" : " "
        return original + separator + speech
    }
}

@MainActor
final class MiraRecordingAuthorization {
    enum Outcome: Equatable { case authorized, denied, cancelled }
    private var current: UUID?

    func cancel() { current = nil }

    func request(speech: () async -> Bool, microphone: () async -> Bool) async -> Outcome {
        let id = UUID(); current = id
        defer { if current == id { current = nil } }
        guard !Task.isCancelled else { return .cancelled }
        let speechAllowed = await speech()
        guard current == id, !Task.isCancelled else { return .cancelled }
        guard speechAllowed else { return .denied }
        let microphoneAllowed = await microphone()
        guard current == id, !Task.isCancelled else { return .cancelled }
        return microphoneAllowed ? .authorized : .denied
    }
}
