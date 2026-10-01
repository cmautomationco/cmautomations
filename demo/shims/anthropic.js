// The browser test build has no API key, so the optional AI idea engine is never used.
export default class Anthropic {
  constructor() { throw new Error('AI ideas are not available in the browser test build'); }
}
