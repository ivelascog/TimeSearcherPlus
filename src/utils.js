let DEBUG = true;
let before = 0;

export function log() {
  if (DEBUG) console.log(performance.now() - before, ...arguments);
  before = performance.now();
}

export function compareMaps(map1, map2) {
  for (const [key, value] of map1) {
    if (map2.get(key) !== value) {
      return false;
    }
  }
  return true;
}
