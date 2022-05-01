# 💾 Svelte Disk

[<img src="https://img.shields.io/github/v/tag/syfrtech/svelte-disk" />](https://github.com/syfrtech/svelte-disk/releases) [<img src="https://img.shields.io/github/languages/top/syfrtech/svelte-disk" />](https://github.com/syfrtech/svelte-disk/tree/master/src) [<img src="https://img.shields.io/github/package-json/dependency-version/syfrtech/svelte-disk/dev/svelte" />](#svelte)

Persist/cache Svelte stores to local disk / web storage (Indexed DB).

# Quickstart

```ts
import { buildWritable, idbDisk } from "svelte-disk";

export const example$ = buildWritable(
  { firstVisit: new Date(), name:"User" },
  { disk: idbDisk("example") }
);

export async function doExample(){
  await example$.diskRevive(); // restore data if we have it
  example.update(cur=>{...cur, name:"Joe Bauers"}); // Svelte store updates are auto-persisted to disk
  await example$.diskDetach(); // stops updates from persisting to disk
}
```
