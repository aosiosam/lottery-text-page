import {classify,beijingDate} from './lottery.mjs';
import {indexHtml,adminHtml} from './pages.mjs';
let cached=null,inflight=null;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}});
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
async function equal(a,b){const hash=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v))));const[x,y]=await Promise.all([hash(a),hash(b)]);let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0}
async function check(){if(cached&&Date.now()-cached.at<8000&&cached.value.today===beijingDate())return cached.value;if(inflight)return inflight;inflight=(async()=>{let value;try{const r=await fetch('https://49208.com/unite49/h5/index/lastLotteryRecord?lotteryType=2',{headers:{lotteryType:'2','Cache-Control':'no-cache'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();value=classify(await r.json())}catch{value={state:'error',today:beijingDate(),error:'无法核实当前开奖，前台持续加载。'}}cached={value,at:Date.now()};return value})().finally(()=>inflight=null);return inflight}
async function read(env,key){const obj=await env.BUCKET.get(key);return obj?obj.json():null}
async function body(req){const raw=await req.text();if(raw.length>100000)throw Error();return JSON.parse(raw||'{}')}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
async function archive(env,status,settings){
 if(status.state!=='complete')return null;
 const key='history/'+status.drawDate+'.json';const existing=await read(env,key);if(existing)return existing;
 const record={date:status.drawDate,period:status.period,numbers:status.numbers,special:status.special,text:settings?.afterText||'',savedAt:new Date().toISOString()};
 const saved=await env.BUCKET.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{date:record.date,period:String(record.period),numbers:record.numbers.join(' '),savedAt:record.savedAt}});
 return saved?record:await read(env,key);
}
async function listHistory(env,before){let cursor,objects=[];do{const page=await env.BUCKET.list({prefix:'history/',include:['customMetadata'],cursor,limit:1000});objects.push(...page.objects);cursor=page.truncated?page.cursor:undefined}while(cursor);return objects.filter(o=>!before||o.key.slice(8,18)<before).sort((a,b)=>b.key.localeCompare(a.key)).slice(0,31).map(o=>({date:o.key.slice(8,18),period:o.customMetadata?.period||'',numbers:o.customMetadata?.numbers||'',url:'/'+o.key.slice(8,18)}))}
export default {async fetch(req,env){try{
 const url=new URL(req.url),path=url.pathname;
 if(req.method==='POST'&&req.headers.get('Origin')&&req.headers.get('Origin')!==url.origin)return json({error:'请求来源不匹配'},403);
 if(req.method==='GET'&&['/','/index.html','/admin','/admin.html'].includes(path))return new Response(path.startsWith('/admin')?adminHtml:indexHtml,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
 if(req.method==='GET'&&/^\/\d{4}-\d{2}-\d{2}$/.test(path)){const date=path.slice(1);if(!validDate(date)||date>beijingDate())return json({error:'日期不存在'},404);if(date<beijingDate()&&!await read(env,'history/'+date+'.json'))return new Response('该日期暂无已保存记录。',{status:404,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});return new Response(indexHtml,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}})}
 if(path==='/api/display'&&req.method==='GET'){
  const date=url.searchParams.get('date');if(date&&(!validDate(date)||date>beijingDate()))return json({error:'日期不存在'},404);
  if(date){const record=await read(env,'history/'+date+'.json');if(record)return json({state:'complete',text:record.text,date:record.date});if(date!==beijingDate())return json({error:'暂无记录'},404)}
  const status=await check();const settings=status.state==='complete'?await read(env,'settings.json'):null;const record=await archive(env,status,settings);
  return json({state:status.state,text:status.state==='complete'?(date?record?.text||'':settings?.afterText||''):'',date:status.today,archived:!!record});
 }
 if(req.method==='GET'&&/^\/api\/history\/\d{4}-\d{2}-\d{2}$/.test(path)){const date=path.slice('/api/history/'.length);if(!validDate(date))return json({error:'日期不存在'},404);const record=await read(env,'history/'+date+'.json');return record?json(record):json({error:'暂无记录'},404)}
 if(path==='/api/login'&&req.method==='POST'){
  if(!env.ADMIN_PASSWORD)return json({error:'后台尚未配置'},503);
  const ip=req.headers.get('CF-Connecting-IP')||'unknown',key='attempts/'+encodeURIComponent(ip),record=await read(env,key);if(record&&record.until>Date.now()&&record.count>=10)return json({error:'尝试过多，请 15 分钟后再试'},429);
  const d=await body(req);if(!await equal(d.password||'',env.ADMIN_PASSWORD)){await env.BUCKET.put(key,JSON.stringify({count:(record?.until>Date.now()?record.count:0)+1,until:Date.now()+900000}));return json({error:'密码错误'},401)}
  await env.BUCKET.delete(key);const id=token();await env.BUCKET.put('sessions/'+id,JSON.stringify({expires:Date.now()+43200000,csrf:token()}));return json({ok:true},200,{'Set-Cookie':`session=${id}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`});
 }
 if(path.startsWith('/api/admin/')||path==='/api/logout'||path==='/preview'){
  const id=/\bsession=([a-f0-9]{64})\b/.exec(req.headers.get('Cookie')||'')?.[1];const session=id?await read(env,'sessions/'+id):null;if(!session||session.expires<Date.now())return json({error:'请先登录'},401);
  if(path==='/preview'&&req.method==='GET'){const settings=await read(env,'settings.json');const text=String(settings?.afterText||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');const html=indexHtml.replace(/<script>[\s\S]*?<\/script>/,'').replace('id="loading" class="loading"','id="loading" class="loading" hidden').replace('<main id="text" hidden></main>','<main id="text">'+text+'</main>');return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}})}
  if(req.method==='POST'&&!await equal(req.headers.get('X-CSRF-Token')||'',session.csrf))return json({error:'请重新登录后再操作'},403);
  if(path==='/api/admin/status'&&req.method==='GET')return json(await check());
  if(path==='/api/admin/history'&&req.method==='GET'){const before=url.searchParams.get('before');if(before&&!validDate(before))return json({error:'日期无效'},400);const items=await listHistory(env,before);return json({items:items.slice(0,30),next:items.length>30?items[29].date:null})}
  if(path==='/api/admin/settings'&&req.method==='GET'){const settings=await read(env,'settings.json');return json({afterText:settings?.afterText||'',csrf:session.csrf})}
  if(path==='/api/admin/settings'&&req.method==='POST'){const d=await body(req);if(typeof d.afterText!=='string'||d.afterText.length>50000)return json({error:'最多 50000 字'},400);await env.BUCKET.put('settings.json',JSON.stringify({afterText:d.afterText}));return json({ok:true})}
  if(path==='/api/logout'&&req.method==='POST'){await env.BUCKET.delete('sessions/'+id);return json({ok:true},200,{'Set-Cookie':'session=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
 }
 return json({error:'页面不存在'},404);
 }catch{return json({error:'暂时无法处理，请稍后重试'},503)}}};
