export const AUTH_COOKIE_NAME = "paste_logbook_auth";

let cachedTokenKey = "";
let cachedTokenPromise = null;

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API is not available in this runtime.");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export async function getExpectedAuthToken() {
  const password = process.env.APP_PASSWORD || "";
  if (!password) {
    cachedTokenKey = "";
    cachedTokenPromise = null;
    return "";
  }

  const salt = process.env.AUTH_SALT || "paste-logbook-default-salt";
  const nextKey = `${password}|${salt}`;

  if (cachedTokenPromise && cachedTokenKey === nextKey) {
    return cachedTokenPromise;
  }

  cachedTokenKey = nextKey;
  cachedTokenPromise = sha256Hex(nextKey);
  return cachedTokenPromise;
}
