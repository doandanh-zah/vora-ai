import Foundation
import Testing
@testable import Vora

@Suite(.serialized) struct NodeServiceManagerTests {
    @Test func `builds node service commands with current CLI shape`() async throws {
        try await TestIsolation.withUserDefaultsValues(["vora.gatewayProjectRootPath": nil]) {
            let tmp = try makeTempDirForTests()
            CommandResolver.setProjectRoot(tmp.path)

            let voraPath = tmp.appendingPathComponent("node_modules/.bin/vora")
            try makeExecutableForTests(at: voraPath)

            let start = NodeServiceManager._testServiceCommand(["start"])
            #expect(start == [voraPath.path, "node", "start", "--json"])

            let stop = NodeServiceManager._testServiceCommand(["stop"])
            #expect(stop == [voraPath.path, "node", "stop", "--json"])
        }
    }
}
