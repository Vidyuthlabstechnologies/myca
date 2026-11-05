import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function withProviderContext(context, fn) {
  return store.run(Object.freeze({ ...context }), fn);
}

export function providerContext() {
  return store.getStore() || null;
}
