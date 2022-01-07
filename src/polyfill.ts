import zlib from "https://cdn.esm.sh/v61/browserify-zlib@0.2.0/deno/browserify-zlib.bundle.js";
// Old polyfill doesn't conform to current Node.js spec
Object.assign(zlib, { constants: { Z_SYNC_FLUSH: zlib.Z_SYNC_FLUSH } });

// Used for inquire
// globalThis.eval = () => {};

const oldSetTimeout = setTimeout;
// @ts-ignore Hack since Deno makes minimum 4ms
// deno-lint-ignore no-global-assign
setTimeout = (cb: () => void, delay: number): number => {
  if (delay === 0) {
    queueMicrotask(cb);
    return 0;
  }
  return oldSetTimeout(cb, delay);
};
