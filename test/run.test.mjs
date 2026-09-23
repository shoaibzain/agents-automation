import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {openDb} from '../src/db.mjs';

test('daily collector persists direct checks for missing search products and prevents a second run',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agents-automation-run-test-'));
  const dbPath=join(dir,'agents-automation.sqlite'),hook=join(dir,'hook.mjs'),calls=join(dir,'calls.txt');
  let db=openDb(dbPath);
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?)').run('7','Saved item','https://www.daraz.pk/products/i7.html','Home','Seller','2026-09-22','2026-09-22');
  db.prepare('INSERT INTO snapshots(product_id,day,captured_at,price,source) VALUES(?,?,?,?,?)').run('7','2026-09-22','2026-09-22',800,'test');db.close();
  await writeFile(hook,`import {appendFileSync} from 'node:fs';
    globalThis.setTimeout=callback=>{queueMicrotask(callback);return 0};
    globalThis.fetch=async url=>{appendFileSync(${JSON.stringify(calls)},'call\\n');url=new URL(url);
      if(url.pathname.endsWith('search_products'))return {ok:true,json:async()=>({status:'success',data:{products:[{itemId:'8',name:'New item',price:900,review:12}]}})};
      return {ok:true,json:async()=>({status:'success',data:{module:{product:{title:'Saved item'},review:{ratings:{reviewCount:21,average:4.2}},skuInfos:{'0':{itemId:'7',skuId:'sku7',price:{salePrice:{value:3300}},operation:{disable:false}}}}}})};
    };`);
  const run=()=>spawnSync(process.execPath,['--import',pathToFileURL(hook).href,'src/run.mjs'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,AGENTS_AUTOMATION_DATA_DIR:dir,AGENTS_AUTOMATION_RUN_DAY:'2026-09-23',PARSE_API_KEY:'test'},encoding:'utf8'});
  try{
    const first=run();assert.equal(first.status,0,first.stderr);const count=(await readFile(calls,'utf8')).trim().split('\n').length;assert.equal(count,6);
    db=openDb(dbPath);assert.equal(db.prepare("SELECT price FROM snapshots WHERE product_id='7' AND day='2026-09-23'").get().price,3300);assert.equal(db.prepare("SELECT sku_id FROM watchlist WHERE product_id='7'").get().sku_id,'sku7');assert.equal(db.prepare("SELECT imported FROM runs WHERE day='2026-09-23'").get().imported,2);db.close();
    const second=run();assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/already complete/);assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,count);
  }finally{assert.ok(dir.startsWith(join(tmpdir(),'agents-automation-run-test-')));await rm(dir,{recursive:true,force:true})}
});
