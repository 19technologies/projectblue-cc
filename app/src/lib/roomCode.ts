// Ambiguity-free alphabet for generated codes: skip 0/O, 1/I/L.
// Validation still accepts the full [A-Z0-9] set in case someone shares
// a code typed by hand.
const GEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

export const generateRoomCode = (): string => {
  let out = "";
  const cryptoObj = typeof window !== "undefined" ? window.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(6);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < 6; i++) {
      out += GEN_ALPHABET[buf[i] % GEN_ALPHABET.length];
    }
    return out;
  }
  for (let i = 0; i < 6; i++) {
    out += GEN_ALPHABET[Math.floor(Math.random() * GEN_ALPHABET.length)];
  }
  return out;
};

export const validateRoomCode = (value: string): boolean =>
  ROOM_CODE_REGEX.test(value);

export const validatePartialRoomCode = (value: string): boolean =>
  /^[A-Z0-9]{0,6}$/.test(value);

export const normalizeRoomCode = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
