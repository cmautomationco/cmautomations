// Runs before any server module: the small slice of Node globals the server code touches.
globalThis.process = globalThis.process || { env: {}, argv: [], cwd: () => '/' };
// Links in demo messages point back at this page.
// The test build simulates card payments (there is no Stripe account behind it).
globalThis.process.env.DEMO_MODE = 'true';
try { globalThis.process.env.PUBLIC_URL = `${location.origin}${location.pathname}`; } catch { /* not in a browser */ }

/** Uint8Array that prints as hex like a Node Buffer does. */
export class HexBytes extends Uint8Array {
  toString(encoding) {
    if (encoding === 'hex') return [...this].map((b) => b.toString(16).padStart(2, '0')).join('');
    return super.toString();
  }
}

globalThis.Buffer = globalThis.Buffer || {
  from(value, encoding) {
    if (encoding === 'hex') return HexBytes.from(value.match(/../g) || [], (h) => parseInt(h, 16));
    return HexBytes.from(new TextEncoder().encode(String(value)));
  },
};
