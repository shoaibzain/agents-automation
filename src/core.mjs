export function parseCsv(input) {
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);field='';if(row.some(v=>v.trim()))rows.push(row);row=[]}else field+=c}
  if(quoted)throw Error('CSV has an unclosed quoted field');row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  const headers=rows.shift()?.map(v=>v.trim().replace(/^\uFEFF/,''));if(!headers)throw Error('CSV is empty');
  return rows.map((values,i)=>{if(values.length!==headers.length)throw Error(`CSV row ${i+2} has ${values.length} fields; expected ${headers.length}`);return Object.fromEntries(headers.map((h,j)=>[h,values[j].trim()]))});
}
function number(value,name,{integer=false,min=0,max=Infinity}={}){if(value===undefined||value===null||value==='')return null;const n=Number(String(value).replace(/,/g,''));if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error(`Invalid ${name}: ${value}`);return n}
export function normalize(row){
  const id=String(row.id||'').trim(),title=String(row.title||'').trim(),url=String(row.url||'').trim();
  if(!id||!title||!url)throw Error('Every product needs id, title, and url');
  const parsed=new URL(url);if(parsed.protocol!=='https:'||!/(^|\.)daraz\.pk$/.test(parsed.hostname))throw Error(`Product URL must be on daraz.pk: ${url}`);
  return {id,title,url,category:String(row.category||'').trim(),seller:String(row.seller||'').trim(),price:number(row.price,'price'),price_basis:String(row.price_basis||'search_listing'),sold_count:number(row.sold_count,'sold_count',{integer:true}),review_count:number(row.review_count,'review_count',{integer:true}),rating:number(row.rating,'rating',{max:5}),availability:String(row.availability||'').trim()};
}
export function analyze(current,history){
  function prior(days){const cutoff=new Date(`${current.day}T00:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-days);return history.filter(x=>x.day<=cutoff.toISOString().slice(0,10)).at(-1)}
  function delta(field,days){const old=prior(days);if(field==='price'&&old?.price_basis!==current.price_basis)return null;return old&&current[field]!=null&&old[field]!=null?current[field]-old[field]:null}
  const sold7=delta('sold_count',7),sold30=delta('sold_count',30),reviews7=delta('review_count',7),price1=delta('price',1);
  const signals=[];if(sold7!=null&&sold7>0)signals.push(`Observed sold count +${sold7} since ${prior(7).day}`);if(reviews7!=null&&reviews7>0)signals.push(`Reviews +${reviews7} since ${prior(7).day}`);if(price1!=null&&price1!==0)signals.push(`Price ${price1>0?'rose':'fell'} PKR ${Math.abs(price1)} since ${prior(1).day}`);
  const momentum=sold7==null&&reviews7==null?null:Math.max(0,sold7||0)+Math.max(0,reviews7||0)*2;
  return {...current,sold7,sold30,reviews7,price1,momentum,signals,history_days:history.length};
}
