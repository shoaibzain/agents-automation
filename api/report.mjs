import config from '../config.example.json' with {type:'json'};
import {analyze} from '../src/core.mjs';
import {latestRows,loadState} from '../src/state.mjs';

export default async function handler(request,response){
  if(request.method!=='GET')return response.status(405).json({error:'Method not allowed'});
  try{
    const {state,persistent}=await loadState();const report=latestRows(state,config);
    report.products=report.products.map(row=>analyze(row,(state.snapshots[row.id]||[]).filter(s=>s.day<row.day))).sort((a,b)=>(b.momentum??-1)-(a.momentum??-1));
    response.setHeader('Cache-Control','no-store');return response.status(200).json({...report,persistent,settings:{priceMin:config.priceMin,priceMax:config.priceMax,maxCalls:config.maxCallsPerRun,watchlistChecks:config.watchlistChecksPerRun}});
  }catch(error){return response.status(500).json({error:error.message})}
}
