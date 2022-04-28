import {
  type Readable,
  type Writable,
  type Unsubscriber,
  writable,
} from "svelte/store";
// import {
//   observableToNotifier,
//   StartStopObservable,
//   type StartStopObserver,
// } from "./startstop";

/** A persitable value together with expiration labels */
export interface StorageContainer<T> {
  /** when the container was last modified  */
  timestamp: Date;

  /** number of milliseconds this entry should survive */
  cacheTime: number;

  /** the contents of the entry */
  value: T;
}

/**
 * Creates persistence/offline storage of Svelte stores
 * (such as through Indexed DB)
 */
export interface StorageInterface<T> {
  /** Retrieves the container from storage(throws if nonexistent) */
  get(): Promise<StorageContainer<T> | undefined>;

  /** Persists the container to storage for later use */
  set(value: StorageContainer<T>): Promise<void>;

  /** Destroy the container from storage */
  del(): Promise<void>;
}

/** Persistable value and expiration instructions */
export interface StorageContainerOptions<T> {
  value: T;
  cacheTime?: number;
}

/** Instructions on how to store a persistable value */
export interface StorageOptions<T> extends StorageContainerOptions<T> {
  storage: StorageInterface<T>;
}

/**
 * Creates a container from value and container options
 * default cache time is 90 days: 90*24*60*60*1000
 */
function pack<T>({
  value,
  cacheTime = 7776000000,
}: StorageContainerOptions<T>) {
  return {
    timestamp: new Date(),
    cacheTime,
    value,
  } as StorageContainer<T>;
}

/**
 * Conditionally returns a value if not expired.
 * Throws if the value
 * We throw because `undefined` and `false` are valid persisted values
 */
function unpack<T>({ value, timestamp, cacheTime }: StorageContainer<T>) {
  if (timestamp.valueOf() + cacheTime < new Date().valueOf()) {
    throw "expired cacheTime";
  }
  return value;
}

/** Saves the information to the storage */
async function persist<T>({ storage, ...options }: StorageOptions<T>) {
  storage.set(pack(options));
}

/** Recovers the information from the storage */
async function restore<T>(storage: StorageInterface<T>) {
  try {
    let container = await storage.get(); //throws if nonexistent
    let value = unpack(container); // throws if expired
    return value;
  } catch (e) {
    storage.del();
    throw e;
  }
}

// probably don't do this... we should restore asap and not wait for a subscriber
// /**
//  * Retrieves the persisted value when the first subscriber is added
//  */
// export function restoreNotifier<T>(storage: StorageInterface<T>) {
//   let observable = new StartStopObservable<T>();

//   let observer: StartStopObserver<T> = (status, set) => {
//     if (status === "start")
//       try {
//         restore(storage).then((value) => set(value));
//         observable.unsubscribe(observer);
//       } catch (e) {
//         // nothing stored; no action
//       }
//   };

//   observable.subscribe(observer);

//   return observableToNotifier(observable);
// }

/**  A Svelte store which can be persisted to storage. */
export interface PersistentReadable<T> extends Readable<T> {
  /** destroys the persisted value */
  delete: StorageInterface<T>["del"];

  /** future changes to the Svelte store are persisted to storage */
  startPersisting: () => void;

  /** discontinues persisting changes */
  stopPersisting: Unsubscriber;
}

/**  Changes to the Svelte store are persisted to storage. */
export function persistentReadable<T>(
  store: Readable<T>,
  storage: StorageInterface<T>
): PersistentReadable<T> {
  let stopPersisting: PersistentReadable<T>["stopPersisting"];

  let startPersisting: PersistentReadable<T>["startPersisting"] = () => {
    !!stopPersisting && stopPersisting(); // avoid duplicate subscriptions
    stopPersisting = store.subscribe((value) => {
      persist({ storage, value });
    });
  };
  startPersisting();
  return { ...store, delete: storage.del, startPersisting, stopPersisting };
}

/**
 * Same as `PersistentReadable`, but with the added option to
 * restore the persisted value.
 */
export interface PersistentWritable<T>
  extends PersistentReadable<T>,
    Writable<T> {
  /**
   * Sets the store to the persisted value.
   * If persisted data is expired or non-existent, the store will not be set.
   */
  restore: () => void;
}

/** Changes to the Svelte store are persisted to storage. */
export function persistentWritable<T>(
  store: Writable<T>,
  storage: StorageInterface<T>,
  /** if true, the store is promptly set to persisted value */
  autorestore: boolean = true
): PersistentWritable<T> {
  let result = persistentReadable(store, storage);
  let _restore = async () => {
    try {
      let value = await restore<T>(storage);
      store.set(value);
    } catch (e) {
      // no value; no action
    }
  };

  autorestore && _restore();

  return { ...result, ...store, restore: _restore };
}

/** Creates a Svelte store and changes are persisted to storage. */
export function createPersistentWritable<T>(
  /** initial store value (awaiting restore or if not restored) */
  value: T,
  storage: StorageInterface<T>,
  /** if true, the store is promptly set to persisted value */
  autorestore?: boolean
) {
  return persistentWritable<T>(writable(value), storage, autorestore);
}
