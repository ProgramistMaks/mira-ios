import XCTest
import UIKit

final class LaunchTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testCharacterAndPersistentNote() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        // The cold iOS 26 CI run loaded the renderer after the original sixty-second deadline.
        // Still require both renderer readiness and actual character pixels; no placeholder may pass.
        XCTAssertTrue(app.descendants(matching: .any)["avatar.ready"].waitForExistence(timeout: 120),
                      "Bundled VRM must actually load inside WKWebView")
        assertAvatarVisible(app)
        capture("Portrait — voice-first home and loaded character")
        for id in ["home.chat", "home.conversation", "home.previewVoice"] {
            XCTAssertTrue(app.buttons[id].isHittable)
            XCTAssertGreaterThanOrEqual(app.buttons[id].frame.height, 44)
        }
        app.buttons["home.chat"].tap()
        let welcome = app.staticTexts["conversation.welcome"]
        let transcript = app.descendants(matching: .any)["conversation.messages"]
        XCTAssertTrue(welcome.exists, "A fresh conversation must show its opening prompt")
        XCTAssertGreaterThanOrEqual(welcome.frame.minY, transcript.frame.minY,
                                    "Initial bottom anchoring must not crop the welcome heading")
        XCTAssertLessThanOrEqual(welcome.frame.maxY, transcript.frame.maxY)
        capture("Portrait — native app and loaded character")
        for label in ["Начать запись", "Отправить"] {
            let control = app.buttons[label]
            XCTAssertGreaterThanOrEqual(control.frame.width, 44, "Glass controls retain a usable hit target")
            XCTAssertGreaterThanOrEqual(control.frame.height, 44)
        }
        XCTAssertFalse(app.buttons["Отправить"].isEnabled)
        let draft = app.descendants(matching: .any)["conversation.input"]
        draft.tap()
        draft.typeText("Glass draft")
        XCTAssertTrue(app.buttons["Отправить"].isEnabled)
        XCTAssertTrue(app.buttons["Отправить"].isHittable)
        capture("Glass composer — keyboard and enabled send")
        draft.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 11))
        XCTAssertFalse(app.buttons["Отправить"].isEnabled)

        app.buttons["Готово"].tap()
        app.buttons["Настройки"].tap()
        XCTAssertTrue(app.navigationBars["Настройки"].waitForExistence(timeout: 5))
        capture("Native settings")
        app.buttons["Готово"].tap()
        app.buttons["home.chat"].tap()
        app.buttons["Команды"].tap()
        let input = app.descendants(matching: .any)["command.input"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        let note = "Local note " + UUID().uuidString.prefix(8)
        input.typeText(note)
        app.buttons["command.saveNote"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["Понятно"].tap()
        app.buttons["Готово"].tap()
        app.terminate()

        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["avatar.ready"].waitForExistence(timeout: 120))
        app.buttons["home.chat"].tap()
        app.buttons["Команды"].tap()
        XCTAssertTrue(app.staticTexts[note].waitForExistence(timeout: 5), "Saved note must survive a cold launch")
        app.buttons["Готово"].tap()

        // Explicit commands work even with no cloud key or local model installed.
        app.buttons["home.chat"].tap()
        let commandNote = "Offline command " + UUID().uuidString.prefix(8)
        let composer = app.descendants(matching: .any)["conversation.input"]
        composer.tap()
        composer.typeText("Мира, сохрани заметку: " + commandNote)
        app.buttons["Отправить"].tap()
        XCTAssertTrue(app.navigationBars["Новая заметка"].waitForExistence(timeout: 5))
        capture("Offline command — explicit review before saving")
        app.buttons["Отмена"].tap() // Dismissing the preview must not execute the action.
        app.buttons["Команды"].tap()
        XCTAssertFalse(app.staticTexts[commandNote].exists)
        app.buttons["Готово"].tap()
        app.buttons["home.chat"].tap()
        app.buttons["Отправить"].tap()
        XCTAssertTrue(app.navigationBars["Новая заметка"].waitForExistence(timeout: 5))
        app.buttons["command.saveNote"].tap()
        XCTAssertTrue(app.buttons["Команды"].waitForExistence(timeout: 5))
        app.buttons["Команды"].tap()
        XCTAssertTrue(app.staticTexts[commandNote].waitForExistence(timeout: 5))
        app.buttons["Готово"].tap()

        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.buttons["Настройки"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["avatar.ready"].waitForExistence(timeout: 60))
        assertAvatarVisible(app)
        capture("Landscape — adaptive two-column layout")
        XCUIDevice.shared.orientation = .portrait
    }

    func testModelSelectionPersistsWithoutDownloading() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        XCTAssertTrue(app.buttons["Настройки"].waitForExistence(timeout: 30))
        app.buttons["Настройки"].tap()
        app.buttons["models.open"].tap()
        let choice = app.buttons["models.select.qwen35-4b-q4"]
        for _ in 0..<6 where !choice.isHittable { app.swipeUp() }
        if choice.exists { choice.tap() }
        XCTAssertTrue(app.descendants(matching: .any)["models.selected.qwen35-4b-q4"].exists)
        capture("Local model catalogue — selected 4B and compatibility guidance")
        let download = app.buttons["models.download"]
        for _ in 0..<3 where !download.isHittable { app.swipeUp() }
        download.tap()
        let confirmation = app.alerts["Загрузить модель?"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))
        XCTAssertTrue(confirmation.buttons["Скачать"].exists)
        confirmation.buttons["Отмена"].tap()
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["Настройки"].waitForExistence(timeout: 30))
        app.buttons["Настройки"].tap()
        XCTAssertTrue(app.staticTexts["Qwen3.5 4B · Q4_K_M"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Нужна загрузка · 2,74 ГБ"].exists)
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func assertAvatarVisible(_ app: XCUIApplication) {
        // Verify pixels too: a stale ready flag previously hid a blank scene after rotation.
        for attempt in 0..<5 {
            let frame = app.descendants(matching: .any)["avatar.ready"].frame
            if let source = XCUIScreen.main.screenshot().image.cgImage {
                let scaleX = CGFloat(source.width) / app.frame.width
                let scaleY = CGFloat(source.height) / app.frame.height
                let region = CGRect(x: frame.minX * scaleX, y: frame.minY * scaleY,
                                    width: frame.width * scaleX, height: frame.height * scaleY * 0.72).integral
                if let crop = source.cropping(to: region) {
                    var pixels = [UInt8](repeating: 0, count: crop.width * crop.height * 4)
                    let colorful = pixels.withUnsafeMutableBytes { raw -> Int in
                        guard let context = CGContext(data: raw.baseAddress, width: crop.width, height: crop.height,
                            bitsPerComponent: 8, bytesPerRow: crop.width * 4,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return 0 }
                        context.draw(crop, in: CGRect(x: 0, y: 0, width: crop.width, height: crop.height))
                        let buffer = raw.bindMemory(to: UInt8.self)
                        var count = 0
                        for index in stride(from: 0, to: buffer.count, by: 4) {
                            if max(buffer[index], max(buffer[index + 1], buffer[index + 2])) > 115 { count += 1 }
                        }
                        return count
                    }
                    if colorful > crop.width * crop.height / 300 { return }
                }
            }
            if attempt < 4 { Thread.sleep(forTimeInterval: 0.4) }
        }
        XCTFail("Character pixels missing from the upper scene; readiness alone is insufficient")
    }
}
