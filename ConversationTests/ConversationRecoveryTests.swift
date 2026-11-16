import XCTest
#if canImport(MiraConversationCore)
@testable import MiraConversationCore
#else
@testable import Companion
#endif

final class ConversationRecoveryTests: XCTestCase {
    func testExistingMessagesDecodeAndNewMetadataRoundTrips() throws {
        let id = UUID()
        let old = Data("{\"id\":\"\(id)\",\"role\":\"assistant\",\"content\":\"Часть\",\"interrupted\":true}".utf8)
        let previous = try JSONDecoder().decode(Message.self, from: old)
        XCTAssertEqual(previous.id, id)
        XCTAssertNil(previous.replyTo); XCTAssertNil(previous.interruption)
        let current = Message(role: .assistant, content: "Часть", interrupted: true, replyTo: UUID(), interruption: .length)
        XCTAssertEqual(try JSONDecoder().decode(Message.self, from: JSONEncoder().encode(current)), current)
    }

    func testRecoveryFindsLinkedOriginalQuestionAndNeverChangesMessages() {
        let original = Message(role: .user, content: "Исходный вопрос")
        let other = Message(role: .user, content: "Другой вопрос")
        let reply = Message(role: .assistant, content: "Часть", interrupted: true, replyTo: original.id)
        let messages = [original, other, reply]
        XCTAssertEqual(ConversationRecovery.question(for: reply.id, in: messages), original.content)
        XCTAssertEqual(messages, [original, other, reply])
    }

    func testLegacyRecoveryRequiresAdjacentQuestionAndValidInterruptedReply() {
        let question = Message(role: .user, content: "Вопрос")
        let reply = Message(role: .assistant, content: "", interrupted: true)
        XCTAssertEqual(ConversationRecovery.question(for: reply.id, in: [question, reply]), question.content)
        let completed = Message(role: .assistant, content: "Ответ")
        XCTAssertNil(ConversationRecovery.question(for: completed.id, in: [question, completed]))
        XCTAssertNil(ConversationRecovery.question(for: reply.id, in: [question, completed, reply]))
        XCTAssertNil(ConversationRecovery.question(for: question.id, in: [question, reply]))
        XCTAssertNil(ConversationRecovery.question(for: reply.id, in: [reply, question]))
        let dangling = Message(role: .assistant, content: "", interrupted: true, replyTo: UUID())
        XCTAssertNil(ConversationRecovery.question(for: dangling.id, in: [question, dangling]))
    }

    func testRestoringQuestionRequiresConfirmationToReplaceAnExistingDraft() {
        let question = Message(role: .user, content: "Исходный вопрос")
        let reply = Message(role: .assistant, content: "", interrupted: true, replyTo: question.id)
        let messages = [question, reply]
        XCTAssertEqual(ConversationRecovery.restoredQuestion(for: reply.id, in: messages, draft: ""), question.content)
        XCTAssertNil(ConversationRecovery.restoredQuestion(for: reply.id, in: messages, draft: "Новый черновик"))
        XCTAssertEqual(ConversationRecovery.restoredQuestion(for: reply.id, in: messages, draft: "Новый черновик",
                                                              replacingDraft: true), question.content)
        XCTAssertNil(ConversationRecovery.restoredQuestion(for: reply.id, in: [], draft: "Новый черновик", replacingDraft: true))
    }
}

@MainActor
private final class CheckpointGate {
    private var waits: [CheckedContinuation<Void, Error>] = []
    var started: XCTestExpectation?
    func wait() async throws {
        try await withCheckedThrowingContinuation { continuation in
            waits.append(continuation); started?.fulfill()
        }
    }
    func resume(_ index: Int) { waits[index].resume() }
}

final class ResponseCheckpointTests: XCTestCase {
    @MainActor
    func testTokensCoalesceAndSaveTheLatestSnapshot() async {
        let gate = CheckpointGate(), began = expectation(description: "delay began")
        gate.started = began
        let checkpoint = ResponseCheckpoint(delay: { try await gate.wait() })
        var text = "Начало", saved: [String] = []
        let finished = expectation(description: "snapshot written")
        checkpoint.schedule { saved.append(text); finished.fulfill() }
        await fulfillment(of: [began], timeout: 2)
        for _ in 0..<100 { text += "."; checkpoint.schedule { XCTFail("Duplicate save") } }
        gate.resume(0)
        await fulfillment(of: [finished], timeout: 2)
        XCTAssertEqual(saved, [text])
    }

    @MainActor
    func testOldCallbackCannotSaveAfterCancellationOrReplaceNewPendingSave() async {
        let gate = CheckpointGate(), oldStarted = expectation(description: "old delay")
        gate.started = oldStarted
        let checkpoint = ResponseCheckpoint(delay: { try await gate.wait() })
        var saves: [String] = []
        checkpoint.schedule { saves.append("old") }
        await fulfillment(of: [oldStarted], timeout: 2)
        checkpoint.cancel()
        let newStarted = expectation(description: "new delay"), newSaved = expectation(description: "new saved")
        gate.started = newStarted
        checkpoint.schedule { saves.append("new"); newSaved.fulfill() }
        await fulfillment(of: [newStarted], timeout: 2)
        gate.resume(0); gate.resume(1)
        await fulfillment(of: [newSaved], timeout: 2)
        XCTAssertEqual(saves, ["new"])
    }

    @MainActor
    func testCancellationAfterClearingConversationNeverWritesAnOldSnapshot() async {
        let gate = CheckpointGate(), began = expectation(description: "delay")
        gate.started = began
        let checkpoint = ResponseCheckpoint(delay: { try await gate.wait() })
        let obsolete = expectation(description: "no obsolete write"); obsolete.isInverted = true
        checkpoint.schedule { obsolete.fulfill() }
        await fulfillment(of: [began], timeout: 2)
        checkpoint.cancel(); gate.resume(0)
        await fulfillment(of: [obsolete], timeout: 0.05)
    }
}
