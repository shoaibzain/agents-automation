import { inPriceRange } from './parsebot.mjs';
export function seedWatchlist(db,config,day){
  const limit=config.watchlistLimit??21;
  const existing=new Set(db.prepare('SELECT product_id FROM watchlist').all().map(r=>r.product_id));
  const candidates=db.prepare(`SELECT p.id,p.category,s.price,s.review_count FROM products p JOIN snapshots s ON s.product_id=p.id
    WHERE s.day=(SELECT MAX(day) FROM snapshots WHERE product_id=p.id) ORDER BY s.review_count DESC,p.id`).all();
  const groups=new Map();for(const p of candidates){if(existing.has(p.id)||!inPriceRange(p.price,config))continue;if(!groups.has(p.category))groups.set(p.category,[]);groups.get(p.category).push(p)}
  const insert=db.prepare('INSERT OR IGNORE INTO watchlist(product_id,added_at) VALUES(?,?)');
  while(existing.size<limit){let added=false;for(const queue of groups.values()){if(existing.size>=limit)break;const p=queue.shift();if(p){insert.run(p.id,day);existing.add(p.id);added=true}}if(!added)break}
  return existing.size;
}
export function dueWatchlist(db,count){return db.prepare(`SELECT p.*,w.sku_id FROM watchlist w JOIN products p ON p.id=w.product_id
  ORDER BY COALESCE(w.last_attempt_at,''),w.added_at,w.product_id LIMIT ?`).all(count)}
export function saveChecks(db,checks,now){const statement=db.prepare(`UPDATE watchlist SET last_attempt_at=?,last_checked_at=CASE WHEN ? IS NULL THEN ? ELSE last_checked_at END,
  sku_id=COALESCE(?,sku_id),last_error=? WHERE product_id=?`);for(const c of checks)statement.run(now,c.error,now,c.sku_id??null,c.error,c.id)}
