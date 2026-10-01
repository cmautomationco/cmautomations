// Browser stand-in for node:fs. The only file the server reads is its schema.
import schema from '../../server/db/schema.sql';

export function readFileSync(file) {
  if (String(file).endsWith('schema.sql')) return schema;
  throw new Error(`File not available in the browser: ${file}`);
}
export const existsSync = () => false;
export const mkdirSync = () => {};
export const rmSync = () => {};
export default { readFileSync, existsSync, mkdirSync, rmSync };
