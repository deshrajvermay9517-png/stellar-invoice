// Public network identifier, never a credential or client-selectable setting.
export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export function testnetExplorerUrl(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid transaction hash.");
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
