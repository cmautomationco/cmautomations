// Browser stand-in for node:url.
export const fileURLToPath = (u) => { try { return new URL(u).pathname; } catch { return '/'; } };
export default { fileURLToPath };
