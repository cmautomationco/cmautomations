// Browser stand-in for node:path (posix subset).
const normalise = (p) => {
  const out = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return `/${out.join('/')}`;
};
export const join = (...parts) => normalise(parts.join('/'));
export const resolve = (...parts) => normalise(parts.join('/'));
export const dirname = (p) => normalise(p).split('/').slice(0, -1).join('/') || '/';
export default { join, resolve, dirname };
