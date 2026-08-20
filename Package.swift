// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MeditationHost",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "MeditationHost", targets: ["MeditationHost"])],
    targets: [
        .executableTarget(
            name: "MeditationHost",
            path: "Sources/MeditationHost"
        )
    ],
    swiftLanguageModes: [.v5]
)
