import { get, set, del, keys } from "idb-keyval";
import {
  type StorageInterface,
  type StorageContainer,
  noopStorage,
} from "./_utils";

/**
 * Creates an Indexed DB persister
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 */
export function createIDBPersister<T>(idbValidKey: IDBValidKey) {
  if (!window) {
    return noopStorage;
  }
  return {
    get: async () => {
      let result = await get<StorageContainer<T>>(idbValidKey);
      if (result === undefined) {
        if (!(await keys()).includes(idbValidKey)) throw "nonexistent key";
      }
      return result;
    },
    set: async (packed: StorageContainer<T>) => set(idbValidKey, packed),
    del: async () => del(idbValidKey),
  } as StorageInterface<T>;
}
