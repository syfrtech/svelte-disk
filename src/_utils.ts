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
export interface DiskOptions<T> {
  /** the interface to the web storage disk */
  disk: DiskInterface<T>;

  /** the number of milliseconds for the value to survive */
  cacheTime?: number;
}

/** Persistable value and expiration instructions */
export type DiskInstructions<T> = DiskOptions<T> & {
  /** the store value to be persisted */
  value: T;
};

/** Persistable value and expiration instructions */
export type DiskPackInstructions<T> = Omit<DiskInstructions<T>, "disk">;

/**
 * Creates a container with meta information to be persisted
 * default cache time is 90 days: 90*24*60*60*1000
 */
function pack<T>({ value, cacheTime = 7776000000 }: DiskPackInstructions<T>) {
  let now = new Date();
  return {
    modified: now,
    expires: new Date(now.valueOf() + cacheTime),
    value,
  } as DiskPack<T>;
}

/**
 * Conditionally returns a value if not expired.
 * Throws if expired
 * We throw because `undefined` and `false` are valid persisted values
 */
function unpack<T>({ value, expires }: DiskPack<T>) {
  if (expires < new Date()) {
    throw "expired cacheTime";
  }
  return value;
}

/** Saves the information to disk */
async function write<T>({ disk, ...options }: DiskInstructions<T>) {
  return disk.set(pack(options));
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

/** Sets the Svelte store to the value read from disk (or no action if none) */
async function readThenSet<T>(disk: DiskInterface<T>, store: Writable<T>) {
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
  diskUpdate: () => Promise<void>;
}

/**  Adds disk tooling and initiates persistence to disk. */
export function adaptReadable<T>(
  store: Readable<T>,
  options: DiskOptions<T>
): DiskedStore<T> {
  let diskDetach: DiskedStore<T>["diskDetach"];
  let diskAttach: DiskedStore<T>["diskAttach"] = () => {
    !!diskDetach && diskDetach(); // avoid duplicate subscriptions
    diskDetach = store.subscribe((value) => {
      write({ value, ...options });
    });
  };
  let diskUpdate = async () => {
    write({ value: get(store), ...options });
  };
  diskAttach();
  return {
    ...store,
    diskDelete: options.disk.del,
    diskUpdate,
    diskAttach,
    diskDetach,
  };
}

/** Easily create a `DiskedStore` */
export function buildReadable<T>(
  /** initial store value */
  value: T,
  options: DiskOptions<T>
) {
  return adaptReadable<T>(readable(value), options);
}

/** Same as `DiskedStore` with the added ability to `diskRevive` */
export interface DiskedWritable<T> extends DiskedStore<T>, Writable<T> {
  /**
   * Sets the store to the persisted value (async).
   * If persisted data is expired or non-existent, the store will not be set
   * and existing/initial store value remains.
   */
  diskRevive: () => Promise<void>;
}

/**  Adds disk tooling and initiates persistence to disk. */
export function adaptWritable<T>(
  store: Writable<T>,
  options: DiskOptions<T>,
  autoRevive: boolean = true
): DiskedWritable<T> {
  let result = adaptReadable(store, options);
  let diskRevive = async () => readThenSet(options.disk, store);
  autoRevive &&
    (() => {
      result.diskDetach();
      diskRevive().then((_void) => result.diskAttach());
    })();
  return { ...result, ...store, diskRevive };
}

/** Easily create a `DiskedWritable` */
export function buildWritable<T>(
  /** initial store value */
  value: T,
  options: DiskOptions<T>
) {
  return adaptWritable<T>(writable(value), options);
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
