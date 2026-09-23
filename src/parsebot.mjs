const base='https://api.parse.bot/scraper/668a2f8a-7eec-4765-8e69-8089abdf24ae/';
export const numeric=value=>{if(value==null||value==='')return null;const n=Number(String(value).replace(/,/g,''));return Number.isFinite(n)?n:null};
export function inPriceRange(price,config){return price!=null&&price>=(config.priceMin??0)&&price<=(config.priceMax??Infinity)}
export function createClient(key,{fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),maxCalls=6}={}){
  if(!key)throw Error('Set PARSE_API_KEY in the server environment');
  let calls=0;
  return {get calls(){return calls},async get(name,params){
    if(calls>=maxCalls)throw Error('Daily call budget reached');
    if(calls)await wait(12500);
    const url=new URL(name,base);for(const [k,v] of Object.entries(params))if(v!=null)url.searchParams.set(k,String(v));
    calls++;
    const response=await fetcher(url,{headers:{'X-API-Key':key},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`Marketplace API returned HTTP ${response.status}`);
    const payload=await response.json();if(payload.status!=='success')throw Error('Marketplace API did not return success');
    return payload.data;
  }};
}
export async function discover(config,key,{client,offset=0,callLimit=config.maxCallsPerRun??6}={}){
  const searches=config.searches;if(!Array.isArray(searches)||!searches.length)throw Error('Configure marketplace searches');
  if((config.priceMin??0)>(config.priceMax??Infinity))throw Error('priceMin must be <= priceMax');
  client??=createClient(key,{maxCalls:callLimit});
  const start=client.calls,products=new Map(),warnings=[];
  const jobs=searches.flatMap(search=>Array.from({length:config.pagesPerSearch||1},(_,i)=>({search,page:i+1})));
  let attempted=0;
  for(let i=0;i<Math.min(callLimit,jobs.length);i++){
    const {search,page}=jobs[(offset+i)%jobs.length];attempted++;
    if(!search.query&&!search.category)throw Error('Each search needs query or category');
    try{
      const data=await client.get('search_products',{page,sort:search.sort||'BestMatch',query:search.query,category:search.category,price_low:config.priceMin,price_high:config.priceMax});
      if(!Array.isArray(data?.products))throw Error('Search products missing from response');
      for(const item of data.products){
        const id=String(item.itemId||'').trim(),price=numeric(item.price);
        if(!/^\d+$/.test(id)||!item.name||!inPriceRange(price,config))continue;
        products.set(id,{id,title:item.name,url:`https://www.daraz.pk/products/i${id}.html`,category:search.category||search.query,seller:item.sellerName||'',price,price_basis:'search_listing',sold_count:numeric(item.sold_count),review_count:numeric(item.review),rating:numeric(item.ratingScore),availability:item.inStock===false?'out_of_stock':item.inStock===true?'in_stock':'unknown'});
      }
    }catch(e){warnings.push(`${search.category||search.query}: ${e.message}`)}
  }
  return {rows:[...products.values()],calls:client.calls-start,nextOffset:(offset+attempted)%jobs.length,warnings,coverage:`${attempted} search pages; sampled coverage of the marketplace`};
}
export function mapDetail(data,product){
  const m=data?.module;if(!m?.product?.title||!m?.skuInfos)throw Error('Product detail fields missing');
  const defaultSku=m.skuInfos['0'];
  const skuId=product.sku_id||String(defaultSku?.skuId||'');
  const sku=product.sku_id?m.skuInfos[product.sku_id]:defaultSku;
  const itemId=sku?.itemId||m.review?.params?.itemId;
  if(itemId&&String(itemId)!==String(product.id))throw Error('Product detail ID mismatch');
  return {...product,title:m.product.title,seller:m.seller?.name||product.seller,
    sku_id:skuId,price:sku?numeric(sku.price?.salePrice?.value):null,price_basis:skuId?`sku:${skuId}`:'detail_unknown',
    review_count:numeric(m.review?.ratings?.reviewCount),rating:numeric(m.review?.ratings?.average),sold_count:null,
    availability:!sku?'unknown':sku.operation?.disable===true?'unavailable':sku.operation?.disable===false?'in_stock':'unknown'};
}
export async function refreshWatchlist(client,products){
  const rows=[],checks=[];
  for(const product of products){try{
    const row=mapDetail(await client.get('get_product_details',{item_id:product.id}),product);
    rows.push(row);checks.push({id:product.id,sku_id:row.sku_id,error:null});
  }catch(e){checks.push({id:product.id,error:e.message})}}
  return {rows,checks};
}
