import XCTest
@testable import Companion

final class ConversationTests: XCTestCase {
    func testMultilineEventAndKeepAlive() {
        var decoder = EventDecoder()
        XCTAssertNil(decoder.accept(": keepalive"))
        XCTAssertNil(decoder.accept(""))
        XCTAssertNil(decoder.accept("event: message"))
        XCTAssertNil(decoder.accept("data: первая"))
        XCTAssertNil(decoder.accept("data: вторая"))
        XCTAssertEqual(decoder.accept(""), "первая\nвторая")
        XCTAssertNil(decoder.accept(""))
        XCTAssertNil(decoder.accept("data: [DONE]"))
        XCTAssertEqual(decoder.accept(""), "[DONE]")
    }
    func testEndpointPreservesProviderPrefix() throws {
        var settings = ConnectionSettings()
        settings.model = "test-model"
        settings.baseURL = "https://example.com/api/v1/"
        XCTAssertEqual(try settings.endpoint().absoluteString, "https://example.com/api/v1/chat/completions")
        settings.baseURL = "https://example.com/v1/chat/completions"
        XCTAssertEqual(try settings.endpoint().absoluteString, settings.baseURL)
    }
    func testRejectsInsecureOrAmbiguousEndpoints() {
        for address in ["http://example.com/v1", "https://user:secret@example.com/v1",
                        "https://example.com/v1?key=secret", "https://example.com/v1#fragment", ""] {
            var settings = ConnectionSettings(); settings.model = "model"; settings.baseURL = address
            XCTAssertThrowsError(try settings.endpoint())
        }
    }
    func testInterruptedMessageRoundTrip() throws {
        let message = Message(role: .assistant, content: "Неполный ответ", interrupted: true)
        XCTAssertEqual(try JSONDecoder().decode(Message.self, from: JSONEncoder().encode(message)), message)
    }
}
