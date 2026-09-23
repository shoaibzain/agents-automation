import {createClient,discover,refreshWatchlist,inPriceRange} from './parsebot.mjs';

const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'});
const latestSnapshot=(state,id)=>(state.snapshots[id]||[]).at(-1);

function seedWatchlist(state,config,day){
  const limit=config.watchlistLimit??21,existing=new Set(Object.keys(state.watchlist));
  const groups=new Map();
  for(const product of Object.values(state.products)){
    const current=latestSnapshot(state,product.id);if(existing.has(product.id)||!current||!inPriceRange(current.price,config))continue;
    if(!groups.has(product.category))groups.set(product.category,[]);groups.get(product.category).push({...product,...current});
  }
  for(const queue of groups.values())queue.sort((a,b)=>(b.review_count??-1)-(a.review_count??-1));
  while(existing.size<limit){let added=false;for(const queue of groups.values()){if(existing.size>=limit)break;const p=queue.shift();if(p){state.watchlist[p.id]={product_id:p.id,added_at:day,last_attempt_at:null,last_checked_at:null,sku_id:null,last_error:null};existing.add(p.id);added=true}}if(!added)break}
}

function dueWatchlist(state,count){return Object.values(state.watchlist).sort((a,b)=>(a.last_attempt_at||'').localeCompare(b.last_attempt_at||'')||a.added_at.localeCompare(b.added_at)||a.product_id.localeCompare(b.product_id)).slice(0,count).map(w=>({...state.products[w.product_id],sku_id:w.sku_id}))}

export async function runHosted(state,config,key,{day=today(),client}={}){
  if(state.runs.some(r=>r.day===day&&r.status==='complete'))return {status:'already_complete',state};
  seedWatchlist(state,config,day);
  const budget=config.maxCallsPerRun??6,due=dueWatchlist(state,Math.min(config.watchlistChecksPerRun??3,Math.max(0,budget-1)));
  client??=createClient(key,{maxCalls:budget});
  const found=await discover(config,key,{client,offset:Number(state.settings.searchOffset||0),callLimit:budget-due.length});
  const tracked=await refreshWatchlist(client,due),now=new Date().toISOString();
  const rows=[...new Map([...found.rows,...tracked.rows].map(row=>[row.id,row])).values()];
  for(const row of rows){
    const first=state.products[row.id]?.first_seen||day;
    state.products[row.id]={id:row.id,title:row.title,url:row.url,category:row.category,seller:row.seller,first_seen:first,last_seen:day};
    const snapshot={day,captured_at:now,price:row.price,price_basis:row.price_basis||'search_listing',sold_count:row.sold_count,review_count:row.review_count,rating:row.rating,availability:row.availability,source:'Parse marketplace API'};
    const history=state.snapshots[row.id]??=[];const index=history.findIndex(s=>s.day===day);if(index>=0)history[index]=snapshot;else history.push(snapshot);
  }
  for(const check of tracked.checks){const item=state.watchlist[check.id];if(!item)continue;item.last_attempt_at=now;item.last_error=check.error;if(!check.error){item.last_checked_at=now;item.sku_id=check.sku_id||item.sku_id}}
  state.settings.searchOffset=found.nextOffset;seedWatchlist(state,config,day);
  const warnings=[...found.warnings,...tracked.checks.filter(c=>c.error).map(c=>`${c.id}: ${c.error}`)];
  state.runs=state.runs.filter(r=>r.day!==day);state.runs.push({day,started_at:now,finished_at:new Date().toISOString(),status:rows.length?'complete':'failed',source:`Parse marketplace API: ${found.coverage}; ${tracked.rows.length}/${due.length} watchlist checks; ${client.calls}/${budget} calls`,imported:rows.length,error:warnings.join('; ')||null});
  return {status:rows.length?'complete':'failed',state};
}
