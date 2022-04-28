import { createPersistentWritable } from "./_utils";
import { createIDBPersister } from "./storage-idb";

let example = createPersistentWritable(
  {
    hello: "world",
  },
  createIDBPersister("example")
);
