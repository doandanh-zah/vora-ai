// swift-tools-version: 6.2
// Package manifest for the Vora macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Vora",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "VoraIPC", targets: ["VoraIPC"]),
        .library(name: "VoraDiscovery", targets: ["VoraDiscovery"]),
        .executable(name: "Vora", targets: ["Vora"]),
        .executable(name: "vora-mac", targets: ["VoraMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.4.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.10.1"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.9.0"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/VoraKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "VoraIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "VoraDiscovery",
            dependencies: [
                .product(name: "VoraKit", package: "VoraKit"),
            ],
            path: "Sources/VoraDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Vora",
            dependencies: [
                "VoraIPC",
                "VoraDiscovery",
                .product(name: "VoraKit", package: "VoraKit"),
                .product(name: "VoraChatUI", package: "VoraKit"),
                .product(name: "VoraProtocol", package: "VoraKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Vora.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "VoraMacCLI",
            dependencies: [
                "VoraDiscovery",
                .product(name: "VoraKit", package: "VoraKit"),
                .product(name: "VoraProtocol", package: "VoraKit"),
            ],
            path: "Sources/VoraMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "VoraIPCTests",
            dependencies: [
                "VoraIPC",
                "Vora",
                "VoraDiscovery",
                .product(name: "VoraProtocol", package: "VoraKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
