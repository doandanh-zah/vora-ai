import Testing
@testable import Vora

@Suite(.serialized)
@MainActor
struct NodePairingApprovalPrompterTests {
    @Test func `node pairing approval prompter exercises`() async {
        await NodePairingApprovalPrompter.exerciseForTesting()
    }
}
