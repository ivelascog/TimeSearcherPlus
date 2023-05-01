let DEBUG = true;
let before = 0;

export function log() {
  if (DEBUG) console.log(performance.now() - before, ...arguments);
  before = performance.now();
}
