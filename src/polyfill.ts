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

Object.assign(globalThis, {
  process: {
    nextTick: <T>(fn: (self: T) => void, self: T) =>
      queueMicrotask(() => fn(self)),
  },
});
