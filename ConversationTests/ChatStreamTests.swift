import XCTest
#if canImport(MiraConversationCore)
@testable import MiraConversationCore
#else
@testable import Companion
#endif

final class ChatStreamTests: XCTestCase {
    private func event(_ text: String = "", reason: String? = nil, index: Int = 0) -> String {
        var choice: [String: Any] = ["index": index, "delta": ["content": text]]
        if let reason { choice["finish_reason"] = reason }
        let data = try! JSONSerialization.data(withJSONObject: ["choices": [choice]], options: [.sortedKeys])
        return "data: " + String(decoding: data, as: UTF8.self) + "\n\n"
    }
    private let done = "data: [DONE]\n\n"
    @discardableResult
    private func feed(_ value: String, to decoder: inout ChatStreamDecoder) throws -> [ChatStreamDecoder.Output] {
        try value.utf8.compactMap { try decoder.accept($0) }
    }

    func testRussianUTF8AndEmojiSurviveByteDeliveryWithAllLineEndings() throws {
        for newline in ["\n", "\r\n", "\r"] {
            var decoder = ChatStreamDecoder()
            let source = "\u{FEFF}: keepalive\n\nevent: message\ndata:\n\n" + event("Привет, 🌙!") + event(reason: "stop") + done
            let output = try feed(source.replacingOccurrences(of: "\n", with: newline), to: &decoder)
            XCTAssertEqual(output, [.text("Привет, 🌙!"), .finished(.complete)])
            XCTAssertNoThrow(try decoder.endOfStream())
        }
    }

    func testMultilineDataRoleAndUsageEventsDoNotLoseText() throws {
        var decoder = ChatStreamDecoder()
        let source = "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n"
            + "data: {\"choices\":\n" + "data: [{\"delta\":{\"content\":\"Ответ\"}}]}\n\n"
            + "data: {\"choices\":[],\"usage\":{\"total_tokens\":10}}\n\n" + done
        XCTAssertEqual(try feed(source, to: &decoder), [.text("Ответ"), .finished(.complete)])
    }

    func testExplicitFinishReasonsNeverTurnLengthOrFilteringIntoSuccess() throws {
        for (reason, result) in [("stop", ChatCompletion.complete), ("length", .length),
                                 ("content_filter", .filtered), ("tool_calls", .incomplete), ("unknown", .incomplete)] {
            var decoder = ChatStreamDecoder()
            // A final token and reason can arrive in the same event.
            XCTAssertEqual(try feed(event("Часть ответа", reason: reason) + done, to: &decoder),
                           [.text("Часть ответа"), .finished(result)])
            XCTAssertEqual(result == .complete, result.interruption == nil)
        }
    }

    func testEOFWithoutEndMarkerPreservesPreviouslyEmittedTextButFailsCompletion() throws {
        var decoder = ChatStreamDecoder()
        XCTAssertEqual(try feed(event("Уже получено") + event(reason: "stop"), to: &decoder), [.text("Уже получено")])
        XCTAssertThrowsError(try decoder.endOfStream())
        XCTAssertFalse(decoder.finished)
        // A truncated [DONE] event is not a completion either.
        try feed("data: [DONE]\n", to: &decoder)
        XCTAssertThrowsError(try decoder.endOfStream())
    }

    func testEmptyWhitespaceAndOtherChoicesCannotCountAsAnAnswer() throws {
        for source in [done, event(" \n\t") + done, event("Other choice", index: 1) + done] {
            var decoder = ChatStreamDecoder()
            XCTAssertThrowsError(try feed(source, to: &decoder))
            XCTAssertFalse(decoder.finished)
        }
        var filtered = ChatStreamDecoder()
        XCTAssertEqual(try feed(event(reason: "content_filter") + done, to: &filtered), [.finished(.filtered)])
    }

    func testMalformedJSONProviderErrorsAndInvalidUTF8FailWithoutCompleting() throws {
        for invalid in ["data: {broken}\n\n", "data: {\"error\":{\"message\":\"error\"}}\n\n",
                        "data: {\"error\":\"error\",\"choices\":[]}\n\n"] {
            var decoder = ChatStreamDecoder()
            try feed(event("Сохранённая часть"), to: &decoder)
            XCTAssertThrowsError(try feed(invalid + done, to: &decoder))
            XCTAssertFalse(decoder.finished)
        }
        var decoder = ChatStreamDecoder()
        _ = try decoder.accept(0xFF)
        XCTAssertThrowsError(try decoder.accept(10))
    }

    func testWholeEventIsBoundedEvenWhenIndividualLinesAreSmall() throws {
        var decoder = ChatStreamDecoder(maximumEventBytes: 32)
        try feed("data: {\n", to: &decoder)
        try feed("data:         \n", to: &decoder)
        XCTAssertThrowsError(try feed("data:         \n", to: &decoder))
        var longLine = ChatStreamDecoder(maximumEventBytes: 16)
        XCTAssertThrowsError(try feed(String(repeating: "a", count: 17), to: &longLine))
    }

    func testTextLimitDoesNotEmitOverflowAndPostFinishTextIsRejected() throws {
        var decoder = ChatStreamDecoder(maximumCharacters: 5)
        XCTAssertEqual(try feed(event("12345"), to: &decoder), [.text("12345")])
        XCTAssertThrowsError(try feed(event("6"), to: &decoder))
        var late = ChatStreamDecoder()
        try feed(event("Ответ", reason: "stop"), to: &late)
        XCTAssertThrowsError(try feed(event("лишний текст"), to: &late))
        var conflict = ChatStreamDecoder()
        try feed(event("Ответ", reason: "stop"), to: &conflict)
        XCTAssertThrowsError(try feed(event(reason: "length"), to: &conflict))
    }

    func testUTF8ByteBudgetBoundsOutputIndependentlyOfCharacterCount() throws {
        var decoder = ChatStreamDecoder(maximumTextBytes: 4)
        XCTAssertEqual(try feed(event("🌙"), to: &decoder), [.text("🌙")])
        XCTAssertThrowsError(try feed(event("🌙"), to: &decoder))
        XCTAssertFalse(decoder.finished)
    }
}
