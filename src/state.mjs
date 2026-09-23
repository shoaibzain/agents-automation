import seed from '../seed/agents-automation-state.json' with { type: 'json' };

const clone=value=>structuredClone(value);

export async function loadState(){
  if(!process.env.BLOB_READ_WRITE_TOKEN&&!process.env.BLOB_STORE_ID)return {state:clone(seed),etag:null,persistent:false};
  const {get}=await import('@vercel/blob');
  const result=await get('agents-automation/state.json',{access:'private',useCache:false});
  if(!result)return {state:clone(seed),etag:null,persistent:true};
  if(result.statusCode!==200||!result.stream)throw Error(`State storage returned ${result.statusCode}`);
  return {state:JSON.parse(await new Response(result.stream).text()),etag:result.blob.etag,persistent:true};
}

export async function saveState(state,etag){
  if(!process.env.BLOB_READ_WRITE_TOKEN&&!process.env.BLOB_STORE_ID)throw Error('Vercel Blob storage is not configured');
  const {put}=await import('@vercel/blob');
  return put('agents-automation/state.json',JSON.stringify(state),{
    access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60,
    ...(etag?{ifMatch:etag}:{})
  });
}

export function latestRows(state,config){
  const latestRun=[...state.runs].filter(r=>r.status==='complete').sort((a,b)=>b.day.localeCompare(a.day))[0];
  if(!latestRun)return {run:null,products:[],runs:state.runs};
  const products=[];
  for(const product of Object.values(state.products)){
    const history=state.snapshots[product.id]||[],current=history.at(-1),watched=state.watchlist[product.id];
    if(!current)continue;
    if(!watched&&!(current.day===latestRun.day&&current.price>=config.priceMin&&current.price<=config.priceMax))continue;
    products.push({...product,...current,watched:watched?1:0,last_checked_at:watched?.last_checked_at||null,last_attempt_at:watched?.last_attempt_at||null,last_error:watched?.last_error||null});
  }
  return {run:latestRun,products,runs:[...state.runs].sort((a,b)=>b.day.localeCompare(a.day)).slice(0,30)};
}
