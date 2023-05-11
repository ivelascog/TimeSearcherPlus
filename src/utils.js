let DEBUG = true;
let before = 0;

export function log() {
  if (DEBUG) console.log(performance.now() - before, ...arguments);
  before = performance.now();
}

export function compareSets(set1, set2) {
  if (set1.size !== set2.size) return false;

  for (const val of set1) {
    if (!set2.has(val)) {
      return false;
    }
  }
  return true;
}
