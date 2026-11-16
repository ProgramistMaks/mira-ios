import XCTest

final class VoiceConversationTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testVoiceHomeShowsSetupAndPreservesOptionalChatDraft() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        let conversation = app.buttons["home.conversation"]
        XCTAssertTrue(conversation.waitForExistence(timeout: 30))
        XCTAssertEqual(conversation.label, "Подготовить Миру",
                       "Without downloaded weights or a provider, setup must be visible before recording")
        XCTAssertTrue(app.buttons["home.previewVoice"].isHittable,
                      "Voice preview must be available without a model or API key")
        conversation.tap()
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
        app.buttons["Готово"].tap()
        app.buttons["Настройки"].tap()
        app.buttons["Готово"].tap()
        app.buttons["home.chat"].tap()
        XCTAssertEqual(input.value as? String, text)
        app.buttons["Готово"].tap()
        XCTAssertTrue(conversation.isHittable)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Voice-first home — setup, voice preview and optional chat"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
