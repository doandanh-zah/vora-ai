import Foundation
import VoraIPC

extension OnboardingView {
    var requiredPermissionCaps: [Capability] {
        [.appleScript, .accessibility, .screenRecording]
    }

    var missingRequiredPermissionCaps: [Capability] {
        self.requiredPermissionCaps.filter { !(self.permissionMonitor.status[$0] ?? false) }
    }

    @MainActor
    func refreshPerms() async {
        await self.permissionMonitor.refreshNow()
    }

    @MainActor
    func request(_ cap: Capability) async {
        guard !self.isRequesting else { return }
        self.isRequesting = true
        defer { isRequesting = false }
        _ = await PermissionManager.ensure([cap], interactive: true)
        await self.refreshPerms()
    }

    @MainActor
    func requestRequiredPermissionsIfNeeded() async {
        let missing = self.missingRequiredPermissionCaps
        guard !missing.isEmpty else { return }
        guard !self.isRequesting else { return }
        self.isRequesting = true
        defer { self.isRequesting = false }
        _ = await PermissionManager.ensure(missing, interactive: true)
        await self.refreshPerms()
    }

    func maybeAutoRequestRequiredPermissions(for pageIndex: Int) {
        guard self.state.connectionMode == .local else { return }
        guard pageIndex == self.permissionsPageIndex else { return }
        guard !self.didAutoRequestCorePermissions else { return }
        self.didAutoRequestCorePermissions = true
        Task { @MainActor in
            await self.requestRequiredPermissionsIfNeeded()
        }
    }

    func updatePermissionMonitoring(for pageIndex: Int) {
        PermissionMonitoringSupport.setMonitoring(
            pageIndex == self.permissionsPageIndex,
            monitoring: &self.monitoringPermissions)
    }

    func updateDiscoveryMonitoring(for pageIndex: Int) {
        let isConnectionPage = pageIndex == self.connectionPageIndex
        let shouldMonitor = isConnectionPage
        if shouldMonitor, !self.monitoringDiscovery {
            self.monitoringDiscovery = true
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 150_000_000)
                guard self.monitoringDiscovery else { return }
                self.gatewayDiscovery.start()
                await self.refreshLocalGatewayProbe()
            }
        } else if !shouldMonitor, self.monitoringDiscovery {
            self.monitoringDiscovery = false
            self.gatewayDiscovery.stop()
        }
    }

    func updateMonitoring(for pageIndex: Int) {
        self.updatePermissionMonitoring(for: pageIndex)
        self.updateDiscoveryMonitoring(for: pageIndex)
        self.maybeAutoRequestRequiredPermissions(for: pageIndex)
        self.maybeKickoffOnboardingChat(for: pageIndex)
    }

    func stopPermissionMonitoring() {
        PermissionMonitoringSupport.stopMonitoring(&self.monitoringPermissions)
    }

    func stopDiscovery() {
        guard self.monitoringDiscovery else { return }
        self.monitoringDiscovery = false
        self.gatewayDiscovery.stop()
    }

    func installCLI() async {
        guard !self.installingCLI else { return }
        self.installingCLI = true
        defer { installingCLI = false }
        await CLIInstaller.install { message in
            self.cliStatus = message
        }
        self.refreshCLIStatus()
    }

    func refreshCLIStatus() {
        let installLocation = CLIInstaller.installedLocation()
        self.cliInstallLocation = installLocation
        self.cliInstalled = installLocation != nil
    }

    func refreshLocalGatewayProbe() async {
        let port = GatewayEnvironment.gatewayPort()
        let desc = await PortGuardian.shared.describe(port: port)
        await MainActor.run {
            guard let desc else {
                self.localGatewayProbe = nil
                return
            }
            let command = desc.command.trimmingCharacters(in: .whitespacesAndNewlines)
            let expectedTokens = ["node", "vora", "tsx", "pnpm", "bun"]
            let lower = command.lowercased()
            let expected = expectedTokens.contains { lower.contains($0) }
            self.localGatewayProbe = LocalGatewayProbe(
                port: port,
                pid: desc.pid,
                command: command,
                expected: expected)
        }
    }
}
