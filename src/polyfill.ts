globalThis.eval = () => {};

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
