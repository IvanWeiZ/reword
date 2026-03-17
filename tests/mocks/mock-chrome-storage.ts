type StorageData = Record<string, unknown>;

export function createMockChromeStorage() {
  let store: StorageData = {};

  return {
    local: {
      get: async (keys?: string | string[] | null): Promise<StorageData> => {
        if (!keys) return { ...store };
        const keyList = typeof keys === 'string' ? [keys] : keys;
        const result: StorageData = {};
        for (const k of keyList) {
          if (k in store) result[k] = store[k];
        }
        return result;
      },
      set: async (items: StorageData): Promise<void> => {
        Object.assign(store, items);
      },
      clear: async (): Promise<void> => {
        store = {};
      },
    },
    _getStore: () => store,
    _setStore: (data: StorageData) => { store = data; },
  };
}
