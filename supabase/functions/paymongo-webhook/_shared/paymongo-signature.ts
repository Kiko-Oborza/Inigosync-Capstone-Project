function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function decodeHex(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{2}/g)!.map((pair) => parseInt(pair, 16)));
}

export async function validPaymongoSignature(
  rawBody: string,
  header: string,
  webhookSecret: string,
  testMode: boolean,
  nowSeconds = Date.now() / 1000,
): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((segment) => {
    const i = segment.indexOf("=");
    return i > 0 ? [segment.slice(0, i).trim(), segment.slice(i + 1).trim()] : ["", ""];
  }));
  const timestamp = Number(parts.t);
  const signature = testMode ? parts.te : parts.li;
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
  const supplied = decodeHex(signature);
  return supplied !== null && equalBytes(digest, supplied);
}
