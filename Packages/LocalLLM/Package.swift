// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "LocalLLM",
    platforms: [.iOS("18.0"), .macOS(.v14)],
    products: [.library(name: "LocalLLM", targets: ["LocalLLM"]),
               .executable(name: "LocalLLMSmoke", targets: ["LocalLLMSmoke"])],
    targets: [
        .binaryTarget(name: "LlamaFramework", path: "Artifacts/llama.xcframework"),
        .target(name: "LocalLLM", dependencies: ["LlamaFramework"]),
        .executableTarget(name: "LocalLLMSmoke", dependencies: ["LocalLLM"])
    ])
