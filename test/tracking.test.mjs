import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient,discover,mapDetail,refreshWatchlist} from '../src/parsebot.mjs';
import {openDb} from '../src/db.mjs';
import {seedWatchlist,dueWatchlist,saveChecks} from '../src/watchlist.mjs';
import {analyze} from '../src/core.mjs';

test('price bounds go to provider and exclude out-of-range results locally; search rotation advances',async()=>{
  const seen=[];const client=createClient('test',{maxCalls:1,wait:async()=>{},fetcher:async url=>{seen.push(url);return {ok:true,json:async()=>({status:'success',data:{products:[{itemId:1,name:'Too cheap',price:100},{itemId:2,name:'Eligible',price:800},{itemId:3,name:'Too expensive',price:5000}]}})}}});
  const result=await discover({searches:[{query:'a'},{query:'b'}],priceMin:500,priceMax:3000},'test',{client,offset:1,callLimit:1});
  assert.equal(seen[0].searchParams.get('price_low'),'500');assert.equal(seen[0].searchParams.get('price_high'),'3000');assert.equal(seen[0].searchParams.get('query'),'b');assert.deepEqual(result.rows.map(r=>r.id),['2']);assert.equal(result.nextOffset,0);
});
test('missing-from-search product is fetched directly; pinned variant remains stable outside price range',async()=>{
  const product={id:'1',title:'Saved',url:'https://www.daraz.pk/products/i1.html',sku_id:'old'};
  const data={module:{product:{title:'Saved'},review:{ratings:{reviewCount:25,average:4.5}},skuInfos:{'0':{skuId:'new',itemId:'1',price:{salePrice:{value:600}}},old:{itemId:'1',price:{salePrice:{value:3200}},operation:{disable:false}}}}};
  const client={get:async(name,params)=>{assert.equal(name,'get_product_details');assert.equal(params.item_id,'1');return data}};
  const result=await refreshWatchlist(client,[product]);assert.equal(result.rows[0].price,3200);assert.equal(result.rows[0].price_basis,'sku:old');assert.equal(result.rows[0].review_count,25);
  delete data.module.skuInfos.old;assert.equal(mapDetail(data,product).price,null);
});
test('watchlist survives price changes and failed checks rotate without erasing last success',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agents-automation-watchlist-'));const db=openDb(join(dir,'test.sqlite'));
  try{
    for(let i=1;i<=3;i++){db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?)').run(String(i),'Product '+i,'https://www.daraz.pk/x','Home','Seller','2026-09-22','2026-09-22');db.prepare('INSERT INTO snapshots(product_id,day,captured_at,price,source,review_count) VALUES(?,?,?,?,?,?)').run(String(i),'2026-09-22','now',i===3?100:800,'test',10-i)}
    assert.equal(seedWatchlist(db,{priceMin:500,priceMax:3000,watchlistLimit:21},'2026-09-22'),2);
    saveChecks(db,[{id:'1',sku_id:'s1',error:null}],'2026-09-23');
    saveChecks(db,[{id:'1',error:'HTTP 503'}],'2026-09-24');
    assert.equal(dueWatchlist(db,1)[0].id,'2');
    assert.equal(db.prepare('SELECT last_checked_at FROM watchlist WHERE product_id=?').get('1').last_checked_at,'2026-09-23');
    db.prepare('UPDATE snapshots SET price=4000 WHERE product_id=?').run('1');assert.equal(seedWatchlist(db,{priceMin:500,priceMax:3000,watchlistLimit:21},'2026-09-24'),2);
  }finally{db.close();assert.ok(dir.startsWith(join(tmpdir(),'agents-automation-watchlist-')));await rm(dir,{recursive:true})}
});
test('price comparisons require same basis; trend labels expose actual baseline',()=>{
  const row={day:'2026-09-22',price:600,price_basis:'sku:123',review_count:30};
  const history=[{day:'2026-09-12',price:800,price_basis:'search_listing',review_count:20}];
  const result=analyze(row,history);assert.equal(result.price1,null);assert.match(result.signals[0],/2026-09-12/);
});
