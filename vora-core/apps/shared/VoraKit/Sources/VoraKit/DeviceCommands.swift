import Foundation

public enum VoraDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum VoraBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum VoraThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum VoraNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum VoraNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct VoraBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: VoraBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: VoraBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct VoraThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: VoraThermalState

    public init(state: VoraThermalState) {
        self.state = state
    }
}

public struct VoraStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct VoraNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: VoraNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [VoraNetworkInterfaceType]

    public init(
        status: VoraNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [VoraNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct VoraDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: VoraBatteryStatusPayload
    public var thermal: VoraThermalStatusPayload
    public var storage: VoraStorageStatusPayload
    public var network: VoraNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: VoraBatteryStatusPayload,
        thermal: VoraThermalStatusPayload,
        storage: VoraStorageStatusPayload,
        network: VoraNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct VoraDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
