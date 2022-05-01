import { get, set, del, keys, createStore } from "idb-keyval";
import { type DiskInterface, type DiskPack, noopDisk } from "./_utils";

/**
 * Creates an Indexed DB persister
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 * @see https://github.com/jakearchibald/idb-keyval/blob/main/custom-stores.md#defining-a-custom-database--store-name
 *
 * @param {IDBValidKey} idbValidKey a name for the Svelte store
 * @param {string} dbName the of the database
 */
export function createIDBPersister<T>(
  idbValidKey: IDBValidKey,
  dbName: string = "svelte-storestore"
) {
  if (typeof window === "undefined") {
    return noopDisk<T>();
  } else {
    let customStore = createStore(dbName, dbName);
    return {
      get: async () => {
        let result = await get<DiskPack<T>>(idbValidKey, customStore);
        if (result === undefined) {
          if (!(await keys()).includes(idbValidKey)) throw "nonexistent key";
        }
        return result;
      },
      set: async (packed: DiskPack<T>) => set(idbValidKey, packed, customStore),
      del: async () => del(idbValidKey, customStore),
    } as DiskInterface<T>;
  }
}
