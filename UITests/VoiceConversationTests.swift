import XCTest

final class VoiceConversationTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testVoiceHomeShowsSetupAndPreservesOptionalChatDraft() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        let conversation = app.buttons["home.conversation"]
        XCTAssertTrue(conversation.waitForExistence(timeout: 30))
        XCTAssertEqual(conversation.label, "Начать разговор",
                       "Offline routine commands do not require an LLM")
        XCTAssertFalse(app.buttons["home.previewVoice"].exists)
        app.buttons["Настройки"].tap()
        XCTAssertTrue(app.navigationBars["Настройки"].waitForExistence(timeout: 5))
        app.buttons["Готово"].tap()
        app.buttons["home.chat"].tap()
        let input = app.descendants(matching: .any)["conversation.input"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        let text = "Мира, сохрани заметку: Voice home " + UUID().uuidString.prefix(8)
        input.tap(); input.typeText(text)
        app.buttons["Отправить"].tap()
        XCTAssertTrue(app.navigationBars["Новая заметка"].waitForExistence(timeout: 5))
        app.buttons["Отмена"].tap()
        XCTAssertEqual(input.value as? String, text)
        app.buttons["conversation.searchMode"].tap()
        XCTAssertTrue(app.navigationBars["Поиск"].exists)
        XCTAssertEqual(input.value as? String, text)
        app.buttons["Отправить"].tap()
        let searchError = app.alerts["Не получилось"]
        XCTAssertTrue(searchError.waitForExistence(timeout: 5), "Search setup errors must appear over the chat sheet")
        XCTAssertTrue(searchError.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Tavily")).firstMatch.exists)
        searchError.buttons["Понятно"].tap()
        XCTAssertEqual(input.value as? String, text, "Missing search setup must preserve the query")
        app.buttons["Готово"].tap()
        app.buttons["Настройки"].tap()
        app.buttons["Готово"].tap()
        app.buttons["home.chat"].tap()
        XCTAssertEqual(input.value as? String, text)
        app.buttons["Готово"].tap()
        XCTAssertTrue(conversation.isHittable)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Voice-first home — automatic conversation and optional chat"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
