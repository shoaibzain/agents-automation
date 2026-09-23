import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { discover } from '../src/parsebot.mjs';

test('automatic marketplace discovery maps listings and reports sampled coverage',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.match(String(url),/query=home%20organizer|query=home\+organizer/);
    assert.equal(options.headers['X-API-Key'],'test-key');
    return {ok:true,json:async()=>({status:'success',data:{products:[{itemId:'434350899',name:'Organizer',price:'799',review:'12',ratingScore:'4.5',sellerName:'Demo',inStock:true}]}})};
  };
  try{const result=await discover({searches:[{query:'home organizer'}],pagesPerSearch:1,maxCallsPerRun:1},'test-key');assert.equal(result.calls,1);assert.equal(result.rows[0].url,'https://www.daraz.pk/products/i434350899.html');assert.equal(result.rows[0].review_count,12);assert.match(result.coverage,/sampled coverage/)}finally{globalThis.fetch=original}
});
