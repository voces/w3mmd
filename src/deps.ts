import zlib from "https://cdn.esm.sh/v43/browserify-zlib@0.2.0/deno/browserify-zlib.js";
// import zlib from "https://esm.sh/browserify-zlib@0.2.0/deno/browserify-zlib.js";
export { Buffer } from "https://esm.sh/buffer@6.0.3";
export {
  json,
  serve,
  validateRequest,
} from "https://deno.land/x/sift@0.3.2/mod.ts";

// Old polyfill doesn't conform to current Node.js spec
Object.assign(zlib, { constants: { Z_SYNC_FLUSH: zlib.Z_SYNC_FLUSH } });

export { ReplayParser } from "https://esm.sh/w3gjs@2.4.2?no-check";

const oldSetTimeout = setTimeout;
// @ts-ignore Hack since Deno makes minimum 4ms
// deno-lint-ignore no-global-assign
setTimeout = (cb: () => void, delay: number) => {
  if (delay === 0) {
    cb();
    return;
  }
  oldSetTimeout(cb, delay);
};
