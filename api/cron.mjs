import config from '../config.example.json' with {type:'json'};
import {loadState,saveState} from '../src/state.mjs';
import {runHosted} from '../src/hosted-run.mjs';

export default async function handler(request,response){
  if(request.method!=='GET')return response.status(405).json({error:'Method not allowed'});
  if(!process.env.CRON_SECRET||request.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return response.status(401).json({error:'Unauthorized'});
  if(!process.env.PARSE_API_KEY||!process.env.BLOB_READ_WRITE_TOKEN)return response.status(503).json({error:'Production storage or marketplace key is not configured'});
  try{
    const loaded=await loadState();const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'});
    const existing=loaded.state.runs.find(r=>r.day===day);
    if(existing?.status==='complete')return response.status(200).json({status:'already_complete',day});
    if(existing?.status==='running'&&Date.now()-Date.parse(existing.started_at)<30*60*1000)return response.status(409).json({status:'already_running',day});
    loaded.state.runs=loaded.state.runs.filter(r=>r.day!==day);loaded.state.runs.push({day,started_at:new Date().toISOString(),status:'running',source:'Vercel Cron',imported:0,error:null});
    const lock=await saveState(loaded.state,loaded.etag);
    const result=await runHosted(loaded.state,config,process.env.PARSE_API_KEY,{day});
    await saveState(result.state,lock.etag);
    return response.status(result.status==='complete'?200:502).json({status:result.status,day,imported:result.state.runs.find(r=>r.day===day)?.imported||0});
  }catch(error){return response.status(error?.name==='BlobPreconditionFailedError'?409:500).json({error:error.message})}
}
