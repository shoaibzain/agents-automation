import { readFile, readdir, mkdir, rename } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { openDb } from './db.mjs';
import { normalize, parseCsv } from './core.mjs';
import { discover,createClient,refreshWatchlist } from './parsebot.mjs';
import { seedWatchlist,dueWatchlist,saveChecks } from './watchlist.mjs';

const root=resolve(import.meta.dirname,'..'),dataDir=resolve(process.env.AGENTS_AUTOMATION_DATA_DIR||process.env.DARAZ_DATA_DIR||join(root,'data'));
const day=process.env.AGENTS_AUTOMATION_RUN_DAY||process.env.DARAZ_RUN_DAY||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'});
if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('AGENTS_AUTOMATION_RUN_DAY must be YYYY-MM-DD');
const db=openDb(join(dataDir,'agents-automation.sqlite'));
if(db.prepare("SELECT 1 FROM runs WHERE day=? AND status='complete'").get(day)){
  console.log(`Run for ${day} already complete; no duplicate snapshot written`);
  db.close();process.exit(0);
}
const config=JSON.parse(await readFile(join(root,'config.json'),'utf8').catch(()=>'{"feedUrl":""}'));
await mkdir(join(dataDir,'inbox'),{recursive:true});await mkdir(join(dataDir,'processed'),{recursive:true});
const inbox=(await readdir(join(dataDir,'inbox'))).filter(x=>x.toLowerCase().endsWith('.csv')).sort();
let source='',text='',csvRows,marketRows,checks=[],warnings=[],nextOffset;
if(inbox.length){source=`CSV: ${inbox.join(', ')}`;try{csvRows=(await Promise.all(inbox.map(x=>readFile(join(dataDir,'inbox',x),'utf8')))).flatMap(content=>parseCsv(content))}catch(e){console.error(`Input rejected: ${e.message}`);process.exit(2)}}
else if(config.source==='parsebot'){try{
  seedWatchlist(db,config,day);
  const budget=config.maxCallsPerRun??6;
  const due=dueWatchlist(db,Math.min(config.watchlistChecksPerRun??3,Math.max(0,budget-1)));
  const client=createClient(process.env.PARSE_API_KEY,{maxCalls:budget});
  const offset=Number(db.prepare("SELECT value FROM settings WHERE key='searchOffset'").get()?.value||0);
  const found=await discover(config,process.env.PARSE_API_KEY,{client,offset,callLimit:budget-due.length});
  const tracked=await refreshWatchlist(client,due);
  checks=tracked.checks;warnings=[...found.warnings,...checks.filter(c=>c.error).map(c=>`${c.id}: ${c.error}`)];nextOffset=found.nextOffset;
  marketRows=[...new Map([...found.rows,...tracked.rows].map(r=>[r.id,r])).values()];
  source=`Parse marketplace API: ${found.coverage}; ${tracked.rows.length}/${due.length} watchlist checks succeeded; ${client.calls}/${budget} calls`;
  console.log(source);
}catch(e){console.error(e.message);process.exit(2)}}
else if(config.feedUrl){const u=new URL(config.feedUrl);if(u.protocol!=='https:')throw Error('feedUrl must be HTTPS');const res=await fetch(u,{signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error(`Feed returned HTTP ${res.status}`);source=config.feedUrl;text=await res.text()}
else{console.error('No input. Put a CSV in data/inbox or configure an approved HTTPS feedUrl.');process.exit(2)}
let rows;
if(marketRows?.length===0){
  const failedAt=new Date().toISOString();saveChecks(db,checks,failedAt);
  db.prepare('INSERT INTO runs(day,started_at,finished_at,status,source,error) VALUES(?,?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET finished_at=excluded.finished_at,status=excluded.status,error=excluded.error').run(day,failedAt,failedAt,'failed',source,warnings.join('; ')||'No eligible products returned');
}
try{rows=marketRows||csvRows||JSON.parse(text);if(!Array.isArray(rows))throw Error('Feed must return a JSON array');rows=rows.map(normalize);if(!rows.length)throw Error('Source has no products');const ids=new Set(rows.map(x=>x.id));if(ids.size!==rows.length)throw Error('Source contains duplicate product IDs')}catch(e){console.error(`Input rejected: ${e.message}`);process.exit(2)}
const started=new Date().toISOString();
try{
  db.exec('BEGIN IMMEDIATE');
  const existing=db.prepare('SELECT status FROM runs WHERE day=?').get(day);
  if(existing?.status==='complete')throw Error(`Run for ${day} already complete; no duplicate snapshot written`);
  db.prepare('INSERT INTO runs(day,started_at,status,source) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET started_at=excluded.started_at,status=excluded.status,source=excluded.source,error=NULL').run(day,started,'running',source);
  const product=db.prepare('INSERT INTO products(id,title,url,category,seller,first_seen,last_seen) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,category=excluded.category,seller=excluded.seller,last_seen=excluded.last_seen');
  const snapshot=db.prepare('INSERT INTO snapshots(product_id,day,captured_at,price,sold_count,review_count,rating,availability,source,price_basis) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product_id,day) DO UPDATE SET captured_at=excluded.captured_at,price=excluded.price,sold_count=excluded.sold_count,review_count=excluded.review_count,rating=excluded.rating,availability=excluded.availability,source=excluded.source,price_basis=excluded.price_basis');
  for(const r of rows){product.run(r.id,r.title,r.url,r.category,r.seller,day,day);snapshot.run(r.id,day,started,r.price,r.sold_count,r.review_count,r.rating,r.availability,source,r.price_basis||'search_listing')}
  saveChecks(db,checks,started);
  if(nextOffset!==undefined)db.prepare("INSERT INTO settings(key,value) VALUES('searchOffset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(nextOffset));
  seedWatchlist(db,config,day);
  db.prepare('UPDATE runs SET finished_at=?,status=?,imported=?,error=? WHERE day=?').run(new Date().toISOString(),'complete',rows.length,warnings.join('; ')||null,day);
  db.exec('COMMIT');
  for(const file of inbox)await rename(join(dataDir,'inbox',file),join(dataDir,'processed',`${day}-${basename(file)}`)).catch(e=>console.error(`CSV archive failed: ${e.message}`));
  console.log(`Imported ${rows.length} products for ${day} from ${source}`);
}catch(e){db.exec('ROLLBACK');console.error(e.message);process.exitCode=1}finally{db.close()}
