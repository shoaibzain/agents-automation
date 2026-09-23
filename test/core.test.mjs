import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyze, normalize, parseCsv } from '../src/core.mjs';

test('CSV supports quoted commas and rejects malformed rows',()=>{
  const rows=parseCsv('id,title,url\n1,"Lamp, portable",https://www.daraz.pk/products/a.html\n');
  assert.equal(rows[0].title,'Lamp, portable');
  assert.throws(()=>parseCsv('id,title\n1'),/expected 2/);
});
test('product validation rejects unsafe URLs and ambiguous counts',()=>{
  assert.throws(()=>normalize({id:'1',title:'x',url:'https://example.com/x'}),/daraz.pk/);
  assert.throws(()=>normalize({id:'1',title:'x',url:'https://www.daraz.pk/x',sold_count:'1.2K'}),/sold_count/);
});
test('trend needs historical snapshots and does not infer sales from one day',()=>{
  const current={day:'2026-09-22',sold_count:135,review_count:22,price:750};
  assert.equal(analyze(current,[]).sold7,null);
  const result=analyze(current,[{day:'2026-09-15',sold_count:120,review_count:18,price:799},{day:'2026-09-21',sold_count:132,review_count:21,price:799}]);
  assert.equal(result.sold7,15);assert.equal(result.reviews7,4);assert.equal(result.price1,-49);
});
