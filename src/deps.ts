import "./polyfill.ts";

import zlib from "https://cdn.esm.sh/v43/browserify-zlib@0.2.0/deno/browserify-zlib.js";
export { Buffer } from "https://esm.sh/v43/buffer@6.0.3";
export {
  json,
  serve,
  validateRequest,
} from "https://deno.land/x/sift@0.3.2/mod.ts";

// Old polyfill doesn't conform to current Node.js spec
Object.assign(zlib, { constants: { Z_SYNC_FLUSH: zlib.Z_SYNC_FLUSH } });

export { ReplayParser } from "https://esm.sh/v43/@voces/w3gjs@2.4.2?no-check";
