import XCTest
import UIKit

final class LaunchTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testCharacterAndPersistentNote() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["avatar.ready"].waitForExistence(timeout: 60),
                      "Bundled VRM must actually load inside WKWebView")
        assertAvatarVisible(app)
        capture("Portrait — native app and loaded character")

        app.buttons["Настройки"].tap()
        XCTAssertTrue(app.navigationBars["Настройки"].waitForExistence(timeout: 5))
        capture("Native settings")
        app.buttons["Готово"].tap()

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
        XCTAssertTrue(app.descendants(matching: .any)["avatar.ready"].waitForExistence(timeout: 60))
        app.buttons["Команды"].tap()
        XCTAssertTrue(app.staticTexts[note].waitForExistence(timeout: 5), "Saved note must survive a cold launch")
        app.buttons["Готово"].tap()

        // Explicit commands work even with no cloud key or local model installed.
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
