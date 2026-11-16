import Foundation

enum ConversationRecovery {
    static func restoredQuestion(for replyID: UUID, in messages: [Message], draft: String,
                                 replacingDraft: Bool = false) -> String? {
        guard replacingDraft || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return question(for: replyID, in: messages)
    }
    static func question(for replyID: UUID, in messages: [Message]) -> String? {
        guard let index = messages.firstIndex(where: { $0.id == replyID }), index > 0,
              messages[index].role == .assistant, messages[index].interrupted else { return nil }
        let reply = messages[index]
        let question: Message?
        if let id = reply.replyTo { question = messages[..<index].first(where: { $0.id == id && $0.role == .user }) }
        else { question = messages[index - 1].role == .user ? messages[index - 1] : nil }
        guard let text = question?.content, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }
}

/// Coalesces token updates into one pending disk save. Invalidates delayed
/// callbacks when an answer stops or the conversation is cleared.
@MainActor
final class ResponseCheckpoint {
    private var pending: Task<Void, Never>?
    private var revision = UUID()
    private let delay: @Sendable () async throws -> Void
    init(delay: @escaping @Sendable () async throws -> Void = { try await Task.sleep(for: .seconds(1)) }) {
        self.delay = delay
    }
    func schedule(save: @escaping @MainActor () -> Void) {
        guard pending == nil else { return }
        let id = UUID(); revision = id
        pending = Task { [weak self, delay] in
            do { try await delay() }
            catch {
                if let self, self.revision == id { self.pending = nil }
                return
            }
            guard let self, !Task.isCancelled, self.revision == id else { return }
            self.pending = nil
            save()
        }
    }
    func cancel() { revision = UUID(); pending?.cancel(); pending = nil }
}
