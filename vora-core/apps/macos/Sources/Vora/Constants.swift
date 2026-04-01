import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-vora writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.vora.mac"
let gatewayLaunchdLabel = "ai.vora.gateway"
let onboardingVersionKey = "vora.onboardingVersion"
let onboardingSeenKey = "vora.onboardingSeen"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "vora.pauseEnabled"
let iconAnimationsEnabledKey = "vora.iconAnimationsEnabled"
let swabbleEnabledKey = "vora.swabbleEnabled"
let swabbleTriggersKey = "vora.swabbleTriggers"
let voiceWakeTriggerChimeKey = "vora.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "vora.voiceWakeSendChime"
let showDockIconKey = "vora.showDockIcon"
let defaultVoiceWakeTriggers = ["vora"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "vora.voiceWakeMicID"
let voiceWakeMicNameKey = "vora.voiceWakeMicName"
let voiceWakeLocaleKey = "vora.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "vora.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "vora.voicePushToTalkEnabled"
let voiceWakeTriggersTalkModeKey = "vora.voiceWakeTriggersTalkMode"
let talkEnabledKey = "vora.talkEnabled"
let iconOverrideKey = "vora.iconOverride"
let connectionModeKey = "vora.connectionMode"
let remoteTargetKey = "vora.remoteTarget"
let remoteIdentityKey = "vora.remoteIdentity"
let remoteProjectRootKey = "vora.remoteProjectRoot"
let remoteCliPathKey = "vora.remoteCliPath"
let canvasEnabledKey = "vora.canvasEnabled"
let cameraEnabledKey = "vora.cameraEnabled"
let systemRunPolicyKey = "vora.systemRunPolicy"
let systemRunAllowlistKey = "vora.systemRunAllowlist"
let systemRunEnabledKey = "vora.systemRunEnabled"
let locationModeKey = "vora.locationMode"
let locationPreciseKey = "vora.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "vora.peekabooBridgeEnabled"
let deepLinkKeyKey = "vora.deepLinkKey"
let modelCatalogPathKey = "vora.modelCatalogPath"
let modelCatalogReloadKey = "vora.modelCatalogReload"
let cliInstallPromptedVersionKey = "vora.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "vora.heartbeatsEnabled"
let debugPaneEnabledKey = "vora.debugPaneEnabled"
let debugFileLogEnabledKey = "vora.debug.fileLogEnabled"
let appLogLevelKey = "vora.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
