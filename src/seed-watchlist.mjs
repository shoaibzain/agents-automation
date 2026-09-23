import { readFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { openDb } from './db.mjs';
import { seedWatchlist } from './watchlist.mjs';
const root=resolve(import.meta.dirname,'..');
const config=JSON.parse(await readFile(join(root,'config.json'),'utf8'));
const db=openDb(join(root,'data','agents-automation.sqlite'));
console.log(`Watchlist saved: ${seedWatchlist(db,config,new Date().toISOString().slice(0,10))} products`);
db.close();
