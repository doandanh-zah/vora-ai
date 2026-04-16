import { PublicKey } from "@solana/web3.js";

export function isValidSolanaAddress(address) {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export async function verifySolanaTransfer(config, { txSignature, receiverAddress, walletAddress, minLamports }) {
  if (!config.solana.verifyOnChain) {
    return { ok: true, mode: "offchain-skip", txSignature };
  }

  // Placeholder strict mode result until RPC indexer is integrated.
  return {
    ok: false,
    mode: "onchain-not-implemented",
    reason: "Enable offchain verify or implement RPC transaction parser",
    txSignature,
    receiverAddress,
    walletAddress,
    minLamports,
  };
}
