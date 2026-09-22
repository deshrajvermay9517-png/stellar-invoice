// Stellar SEP-23: a G-address encodes version 48, a 32-byte public key,
// and a little-endian CRC16-XModem checksum using unpadded RFC4648 base32.
// https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md
export function validateReceivingAccount(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a Stellar public G-address.");
  const address = value.trim();
  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    throw new Error("Enter a 56-character uppercase Stellar G-address. Never enter a secret key.");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of address) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  let crc = 0;
  for (const byte of bytes.slice(0, 33)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  if (bytes.length !== 35 || bytes[0] !== 48 || bytes[33] !== (crc & 255) || bytes[34] !== (crc >>> 8)) {
    throw new Error("This G-address has an invalid checksum. Copy the full public address again.");
  }
  return address;
}
