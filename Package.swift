// swift-tools-version: 5.10
import PackageDescription

// The same lifecycle sources are compiled into the app and widget by XcodeGen.
// This package exercises their concurrency on Linux/macOS without Apple UI SDKs.
let package = Package(
    name: "MiraActivityCore",
    platforms: [.iOS("18.0"), .macOS(.v14)],
    products: [.library(name: "MiraActivityCore", targets: ["MiraActivityCore"])],
    targets: [
        .target(name: "MiraActivityCore", path: "ActivityCore"),
        .testTarget(name: "MiraActivityCoreTests", dependencies: ["MiraActivityCore"], path: "LifecycleTests"),
        .target(name: "MiraDownloadCore", path: "DownloadCore"),
        .testTarget(name: "MiraDownloadCoreTests", dependencies: ["MiraDownloadCore"], path: "DownloadTests",
                    resources: [.copy("Fixtures")])
    ]
)
