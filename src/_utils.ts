import {
  type Readable,
  type Writable,
  type Unsubscriber,
  writable,
  get,
  readable,
} from "svelte/store";

/** A persitable value together with expiration labels */
export interface DiskPack<T> {
  /** when the item was last modified  */
  modified: Date;

  /** when the item expires*/
  expires: Date;

  /** the contents of the entry */
  value: T;
}

/**
 * Creates persistence/offline disk of Svelte stores
 * (such as through Indexed DB)
 */
export interface DiskInterface<T> {
  /** Retrieves the value from disk(throws if nonexistent) */
  get(): Promise<DiskPack<T> | undefined>;

  /** Persists the value to disk for later use */
  set(value: DiskPack<T>): Promise<void>;

  /** Destroy the value from disk */
  del(): Promise<void>;
}

/** Instructions on how to store a persistable value */
export interface DiskedStoreOptions<T> {
  /** the initial store value */
  value?: T;

  /** the interface to the web storage disk */
  disk: DiskInterface<T>;

  /**
   * the number of milliseconds for the value to survive.
   * default is 90 days: `90 * 24 * 60 * 60 * 1000`
   * @see pack
   */
  cacheTime?: number;

  /** unless true, auto subscribe the disk to Svelte store changes */
  noAutoAttach?: boolean;
}

export interface DiskedWritableStoreOptions<T> extends DiskedStoreOptions<T> {
  /** unless true, auto set the store to disk value (if available) */
  noAutoRestore?: boolean;
}

/** Creates a container with meta information to be persisted */
function pack<T>({ value, cacheTime = 7776000000 }: DiskedStoreOptions<T>) {
  let now = new Date();
  return {
    modified: now,
    expires: new Date(now.valueOf() + cacheTime),
    value,
  } as DiskPack<T>;
}

/**
 * Conditionally returns a value if not expired (otherwise throws)
 * We throw because `undefined` and `false` are valid persisted values
 */
function unpack<T>({ value, expires }: DiskPack<T>) {
  if (expires < new Date()) {
    throw "expired cacheTime";
  }
  return value;
}

/** Saves the information to disk */
async function write<T>(options: DiskedStoreOptions<T>) {
  return options.disk.set(pack(options));
}

/** Recovers the information from the disk */
async function read<T>(disk: DiskInterface<T>) {
  try {
    let diskPack = await disk.get(); //throws if nonexistent
    let value = unpack(diskPack); // throws if expired
    return value;
  } catch (e) {
    disk.del(); // remove expired / nonexistent data
    throw e;
  }
}

/** Sets the Svelte store to the disk's value (or no action if none) */
async function restore<T>(disk: DiskInterface<T>, store: Writable<T>) {
  try {
    let value = await read<T>(disk);
    store.set(value);
  } catch (e) {
    // no value; no action
  }
}

/**  A Svelte store which can be persisted to disk. */
export interface DiskedStore<T> extends Readable<T> {
  /** destroys the persisted value on disk */
  diskDelete: DiskInterface<T>["del"];

  /** future changes to the Svelte store are persisted to disk */
  diskAttach: () => void;

  /** discontinues persisting changes */
  diskDetach: Unsubscriber;

  /** save the current Svelte store value to disk (once) */
  diskPersist: () => Promise<void>;
}

/** Same as `DiskedStore` with the added ability to `diskRestore` */
export interface DiskedWritable<T> extends DiskedStore<T>, Writable<T> {
  /**
   * Sets the store to the persisted value (async).
   * If persisted data is expired or non-existent, the store will not be set
   * and existing/initial store value remains.
   */
  diskRestore: () => Promise<void>;
}

/**  Adds disk tooling and optionally initiates persistence to disk. */
export function adaptReadable<T>(
  store: Readable<T>,
  options: DiskedStoreOptions<T>
): DiskedStore<T> {
  let diskDetach: DiskedStore<T>["diskDetach"];
  let diskAttach: DiskedStore<T>["diskAttach"] = () => {
    if (!!diskDetach) return; // don't subscribe if already subscribed
    diskDetach = store.subscribe((value) => {
      write({ ...options, value });
    });
  };
  let diskPersist = async () => {
    write({ ...options, value: get(store) });
  };
  options.noAutoAttach || diskAttach();
  return {
    ...store,
    diskDelete: options.disk.del,
    diskPersist,
    diskAttach,
    diskDetach,
  };
}

/**  Same as `adaptReadable` and optionally restores value from disk */
export function adaptWritable<T>(
  store: Writable<T>,
  options: DiskedWritableStoreOptions<T>
): DiskedWritable<T> {
  let result = adaptReadable(store, options);
  let diskRestore = async () => restore(options.disk, store);
  if (!options.noAutoRestore) {
    result.diskDetach();
    diskRestore();
    result.diskAttach();
  }
  return { ...result, ...store, diskRestore };
}

/**
 * Easily create a `DiskedStore`
 * Be sure to declare the type, ex:`readable<MyExample>(...)`
 */
function buildReadable<T>(options: DiskedStoreOptions<T>) {
  return adaptReadable<T>(readable(options.value), options);
}
export { buildReadable as readable };

/**
 * Easily create a `DiskedWritable`.
 * Be sure to declare the type, ex:`writable<MyExample>(...)`
 * */
function buildWritable<T>(options: DiskedWritableStoreOptions<T>) {
  return adaptWritable<T>(writable(options.value), options);
}
export { buildWritable as writable };

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
