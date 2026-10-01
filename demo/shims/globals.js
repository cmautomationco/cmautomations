// Runs before any server module: the small slice of Node globals the server code touches.
globalThis.process = globalThis.process || { env: {}, argv: [], cwd: () => '/' };

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
