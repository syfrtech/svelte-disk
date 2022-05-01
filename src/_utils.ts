import {
  type Readable,
  type Writable,
  type Unsubscriber,
  writable,
  get,
} from "svelte/store";

/** A persitable value together with expiration labels */
export interface DiskPack<T> {
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
export interface DiskInterface<T> {
  /** Retrieves the container from storage(throws if nonexistent) */
  get(): Promise<DiskPack<T> | undefined>;

  /** Persists the container to storage for later use */
  set(value: DiskPack<T>): Promise<void>;

  /** Destroy the container from storage */
  del(): Promise<void>;
}

/** Instructions on how to store a persistable value */
export interface DiskOptions<T> {
  /** the interface to the persistent store */
  storage: DiskInterface<T>;

  /** the number of milliseconds for the value to survive */
  cacheTime?: number;
}

/** Persistable value and expiration instructions */
export type DiskInstructions<T> = DiskOptions<T> & {
  /** the store value to be persisted */
  value: T;
};

/** Persistable value and expiration instructions */
export type DiskPackInstructions<T> = Omit<DiskInstructions<T>, "storage">;

/**
 * Creates a container from value and container options
 * default cache time is 90 days: 90*24*60*60*1000
 */
function pack<T>({ value, cacheTime = 7776000000 }: DiskPackInstructions<T>) {
  return {
    timestamp: new Date(),
    cacheTime,
    value,
  } as DiskPack<T>;
}

/**
 * Conditionally returns a value if not expired.
 * Throws if the value
 * We throw because `undefined` and `false` are valid persisted values
 */
function unpack<T>({ value, timestamp, cacheTime }: DiskPack<T>) {
  if (timestamp.valueOf() + cacheTime < new Date().valueOf()) {
    throw "expired cacheTime";
  }
  return value;
}

/** Saves the information to the storage */
async function write<T>({ storage, ...options }: DiskInstructions<T>) {
  storage.set(pack(options));
}

/** Recovers the information from the storage */
async function read<T>(storage: DiskInterface<T>) {
  try {
    let container = await storage.get(); //throws if nonexistent
    let value = unpack(container); // throws if expired
    return value;
  } catch (e) {
    storage.del();
    throw e;
  }
}

/** Sets the Svelte store to the value read from persisted storage */
async function readThenSet<T>(storage: DiskInterface<T>, store: Writable<T>) {
  try {
    let value = await read<T>(storage);
    store.set(value);
  } catch (e) {
    // no value; no action
  }
}

/**  A Svelte store which can be persisted to storage. */
export interface PersistentStore<T> extends Readable<T> {
  /** destroys the persisted value */
  diskDelete: DiskInterface<T>["del"];

  /** future changes to the Svelte store are persisted to storage */
  diskAttach: () => void;

  /** discontinues persisting changes */
  diskDetach: Unsubscriber;

  /** save the current Svelte store value to storage (once) */
  diskUpdate: () => Promise<void>;
}

/**  Changes to the Svelte store are persisted to storage. */
export function persistentReadable<T>(
  store: Readable<T>,
  options: DiskOptions<T>
): PersistentStore<T> {
  let diskDetach: PersistentStore<T>["diskDetach"];

  let diskAttach: PersistentStore<T>["diskAttach"] = () => {
    !!diskDetach && diskDetach(); // avoid duplicate subscriptions
    diskDetach = store.subscribe((value) => {
      write({ value, ...options });
    });
  };
  diskAttach();

  let diskUpdate = async () => {
    write({ value: get(store), ...options });
  };
  return {
    ...store,
    diskDelete: options.storage.del,
    diskUpdate,
    diskAttach,
    diskDetach,
  };
}

/**
 * Same as `PersistentStore`, but with the added option to
 * diskRevive the persisted value.
 */
export interface PersistentWritable<T> extends PersistentStore<T>, Writable<T> {
  /**
   * Sets the store to the persisted value (async).
   * If persisted data is expired or non-existent, the store will not be set
   * and existing/initial store value remains.
   */
  diskRevive: () => Promise<void>;
}

/** Changes to the Svelte store are persisted to storage. */
export function persistentWritable<T>(
  store: Writable<T>,
  options: DiskOptions<T>
): PersistentWritable<T> {
  let result = persistentReadable(store, options);
  let diskRevive = async () => readThenSet(options.storage, store);
  return { ...result, ...store, diskRevive };
}

/** Creates a Svelte store and changes are persisted to storage. */
export function createPersistentWritable<T>(
  /** initial store value (awaiting diskRevive or if not diskRevived) */
  value: T,
  options: DiskOptions<T>
) {
  return persistentWritable<T>(writable(value), options);
}

/**
 * Disk implementation that do nothing
 */
export function noopDisk<T>(): DiskInterface<T> {
  return {
    async get() {
      return undefined;
    },
    async del() {
      // Do nothing
    },
    async set() {
      // Do nothing
    },
  };
}
