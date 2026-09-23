import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openDb } from './db.mjs';
import { analyze } from './core.mjs';

const root=resolve(import.meta.dirname,'..'),dataDir=resolve(process.env.AGENTS_AUTOMATION_DATA_DIR||process.env.DARAZ_DATA_DIR||join(root,'data'));
const config=JSON.parse(await readFile(join(root,'config.json'),'utf8').catch(()=>'{"port":3100}'));
const html=await readFile(join(root,'web','index.html'));
const port=Number(process.env.PORT||config.port||3100);
createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);return res.end()}
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html)}
  if(req.url!=='/api/report'){res.writeHead(404);return res.end()}
  const db=openDb(join(dataDir,'agents-automation.sqlite'));
  try{
    const run=db.prepare("SELECT * FROM runs WHERE status='complete' ORDER BY day DESC LIMIT 1").get();
    const rows=run?db.prepare(`SELECT p.*,s.day,s.captured_at,s.price,s.price_basis,s.sold_count,s.review_count,s.rating,s.availability,s.source,
      CASE WHEN w.product_id IS NULL THEN 0 ELSE 1 END watched,w.last_checked_at,w.last_attempt_at,w.last_error
      FROM snapshots s JOIN products p ON p.id=s.product_id LEFT JOIN watchlist w ON w.product_id=p.id
      WHERE s.day=(SELECT MAX(day) FROM snapshots WHERE product_id=p.id)
      AND (w.product_id IS NOT NULL OR (s.day=? AND s.price BETWEEN ? AND ?))`).all(run.day,config.priceMin??0,config.priceMax??1e12):[];
    const products=rows.map(r=>{const history=db.prepare('SELECT day,price,price_basis,sold_count,review_count FROM snapshots WHERE product_id=? AND day<? ORDER BY day').all(r.id,r.day);return analyze(r,history)}).sort((a,b)=>(b.momentum??-1)-(a.momentum??-1));
    const runs=db.prepare('SELECT day,status,source,imported,error FROM runs ORDER BY day DESC LIMIT 30').all();
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({run,products,runs,settings:{priceMin:config.priceMin,priceMax:config.priceMax,maxCalls:config.maxCallsPerRun,watchlistChecks:config.watchlistChecksPerRun}}));
  }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}finally{db.close()}
}).listen(port,'127.0.0.1',()=>console.log(`Agents Automation dashboard: http://localhost:${port}`));
