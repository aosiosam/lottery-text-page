import {displayDefaults,displayAllowed} from './display-control.mjs';
import {browserOpenResponse} from './browser-open.mjs';
import http from 'node:http';
import {Readable} from 'node:stream';
import {handlePoster} from './poster-service.mjs';
import {readFile,writeFile,rename,mkdir,readdir} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {classify,beijingDate} from './lottery.mjs';
const root=dirname(fileURLToPath(import.meta.url)),dir=join(root,'data');await mkdir(dir,{recursive:true});
const historyDir=join(dir,'history');await mkdir(historyDir,{recursive:true});
const settingsFile=join(dir,'settings.json');let settings={afterText:'',...displayDefaults};try{const stored=JSON.parse(await readFile(settingsFile,'utf8'));settings={...displayDefaults,...stored,afterText:typeof stored.afterText==='string'?stored.afterText:''}}catch(e){if(e.code!=='ENOENT')throw e}
let password=process.env.ADMIN_PASSWORD;
if(!password){try{password=(await readFile(join(dir,'admin-password.txt'),'utf8')).trim()}catch(e){if(e.code!=='ENOENT')throw e;password=randomBytes(12).toString('base64url');await writeFile(join(dir,'admin-password.txt'),password,{mode:0o600})}}
const sessions=new Map(),attempts=new Map();let cache=null,inflight=null,writing=false;
async function check(){
 if(cache&&Date.now()-cache.at<8000&&cache.value.today===beijingDate())return cache.value;
 if(inflight)return inflight;
 inflight=(async()=>{let value;try{const r=await fetch('https://49208.com/unite49/h5/index/lastLotteryRecord?lotteryType=2',{headers:{lotteryType:'2','Cache-Control':'no-cache'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('开奖接口暂时不可用');value=classify(await r.json())}catch{value={state:'error',today:beijingDate(),error:'无法核实当前开奖，前台持续加载。'}}cache={value,at:Date.now()};return value})().finally(()=>inflight=null);return inflight;
}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
async function recordFor(date){try{return JSON.parse(await readFile(join(historyDir,date+'.json'),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
async function archive(status){if(status.state!=='complete')return null;const record={date:status.drawDate,period:status.period,numbers:status.numbers,special:status.special,text:settings.afterText,savedAt:new Date().toISOString()};try{await writeFile(join(historyDir,record.date+'.json'),JSON.stringify(record),{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e}return recordFor(record.date)}
function send(res,status,data,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' blob: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"});res.end(type.startsWith('application/json')?JSON.stringify(data):data)}
async function body(req){let str='';for await(const c of req){str+=c;if(Buffer.byteLength(str)>450000)throw Error('内容过长')}return JSON.parse(str||'{}')}
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(path==='/open-browser'&&req.method==='GET'){const out=browserOpenResponse(url,req.headers['user-agent']||'');res.writeHead(out.status,Object.fromEntries(out.headers));return res.end(Buffer.from(await out.arrayBuffer()))}
 if(/^\/\.well-known\/acme-challenge\/[A-Za-z0-9_-]+$/.test(path)&&req.method==='GET'){try{return send(res,200,await readFile(join(root,'.well-known','acme-challenge',path.split('/').pop())),'text/plain; charset=utf-8')}catch{return send(res,404,{error:'Not found'})}}
 if(path==='/assets/hidden-qr.mjs'&&req.method==='GET')return send(res,200,await readFile(join(root,'hidden-qr.mjs')),'text/javascript; charset=utf-8');
 if(req.method==='POST'&&req.headers.origin){if(new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'请求来源不匹配'})}
 const cookie=/\bsession=([a-f0-9]+)\b/.exec(req.headers.cookie||'')?.[1],session=sessions.get(cookie);
 const authorized=session&&session.expires>Date.now();
 if(path==='/api/login'&&req.method==='POST'){
  const ip=req.socket.remoteAddress,entry=attempts.get(ip)||{count:0,until:0};if(entry.until<Date.now())entry.count=0;if(entry.count>=10)return send(res,429,{error:'尝试过多，请 15 分钟后再试'});
  const d=await body(req);if(!equal(d.username||'','admin')||!equal(d.password||'',password)){entry.count++;entry.until=Date.now()+900000;attempts.set(ip,entry);return send(res,401,{error:'账号或密码错误'})}
  attempts.delete(ip);const token=randomBytes(32).toString('hex');sessions.set(token,{expires:Date.now()+43200000,csrf:randomBytes(24).toString('hex')});res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${(req.socket.encrypted||req.headers['x-forwarded-proto']==='https')?'; Secure':''}`);return send(res,200,{ok:true});
 }
 if(path.startsWith('/api/admin/')||path==='/api/logout'||path==='/preview'||path==='/poster'){
  if(!authorized)return send(res,401,{error:'请先登录'});
  if(path==='/poster'&&req.method==='GET')return send(res,200,await readFile(join(root,'poster.html')),'text/html; charset=utf-8');
  if(path==='/preview'&&req.method==='GET'){const text=String(settings.afterText||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');const html=(await readFile(join(root,'index.html'),'utf8')).replace(/<script>[\s\S]*?<\/script>/,'').replace('id="loading" class="loading"','id="loading" class="loading" hidden').replace('<main id="text" hidden></main>','<main id="text">'+text+'</main>');return send(res,200,html,'text/html; charset=utf-8')}
  if(req.method==='POST'&&!equal(req.headers['x-csrf-token']||'',session.csrf))return send(res,403,{error:'请重新登录后再操作'});
  if(path.startsWith('/api/admin/poster/')){
   const bucket={async get(key){try{const bytes=await readFile(join(dir,...key.split('/')));return{body:bytes,json:async()=>JSON.parse(bytes.toString('utf8'))}}catch(e){if(e.code==='ENOENT')return null;throw e}},async put(key,value){const file=join(dir,...key.split('/'));await mkdir(dirname(file),{recursive:true});const temp=file+'.'+randomBytes(6).toString('hex')+'.tmp';await writeFile(temp,value);await rename(temp,file);return{key}}};
   const webReq=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const result=await handlePoster(webReq,{BUCKET:bucket},(data,status=200)=>Response.json(data,{status}),{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   if(result){res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()))}
  }
  if(path==='/api/admin/status'&&req.method==='GET')return send(res,200,await check());
  if(path==='/api/admin/history'&&req.method==='GET'){const before=url.searchParams.get('before');if(before&&!validDate(before))return send(res,400,{error:'日期无效'});const names=(await readdir(historyDir)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)&&(!before||n.slice(0,10)<before)).sort().reverse().slice(0,31);const records=await Promise.all(names.slice(0,30).map(n=>recordFor(n.slice(0,10))));return send(res,200,{items:records.map(r=>({date:r.date,period:r.period,numbers:r.numbers.join(' '),url:'/'+r.date})),next:names.length>30?records[29].date:null})}
  if(path==='/api/admin/settings'&&req.method==='GET')return send(res,200,{...settings,csrf:session.csrf});
  if(path==='/api/admin/settings'&&req.method==='POST'){
   const d=await body(req);if(typeof d.afterText!=='string'||d.afterText.length>50000)return send(res,400,{error:'最多 50000 字'});
   if(writing)return send(res,409,{error:'正在保存，请稍后重试'});writing=true;try{if(!['manual','scheduled'].includes(d.displayMode)||typeof d.manualEnabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.publishTime||''))return send(res,400,{error:'请检查显示方式和时间'});const next={afterText:d.afterText,displayMode:d.displayMode,manualEnabled:d.manualEnabled,publishTime:d.publishTime};await writeFile(settingsFile+'.tmp',JSON.stringify(next,null,2));await rename(settingsFile+'.tmp',settingsFile);settings=next}finally{writing=false}return send(res,200,{ok:true});
  }
  if(path==='/api/logout'&&req.method==='POST'){sessions.delete(cookie);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true})}
 }
 if(req.method==='GET'&&/^\/\d{4}-\d{2}-\d{2}$/.test(path)){const date=path.slice(1);if(!validDate(date)||date>beijingDate())return send(res,404,{error:'日期不存在'});if(date<beijingDate()&&!await recordFor(date))return send(res,404,{error:'暂无历史记录'});return send(res,200,await readFile(join(root,'index.html')),'text/html; charset=utf-8')}
 if(req.method==='GET'&&/^\/api\/history\/\d{4}-\d{2}-\d{2}$/.test(path)){const date=path.slice('/api/history/'.length);if(!validDate(date))return send(res,404,{error:'日期不存在'});const record=await recordFor(date);return send(res,record?200:404,record||{error:'暂无记录'})}
 if(path==='/api/display'&&req.method==='GET'){const date=url.searchParams.get('date');if(date&&(!validDate(date)||date>beijingDate()))return send(res,404,{error:'日期不存在'});if(date){const record=await recordFor(date);if(record)return send(res,200,{state:'complete',text:record.text,date});if(date!==beijingDate())return send(res,404,{error:'暂无记录'})}const today=beijingDate(),allowed=displayAllowed(settings);const s={state:allowed?'complete':'pending',today,drawDate:today,period:settings.displayMode==='manual'?'手动发布':'定时发布',numbers:[],special:null};const record=await archive(s);return send(res,200,{state:s.state,text:s.state==='complete'?(date?record?.text||'':settings.afterText):'',date:s.today,archived:!!record})}
 if(req.method==='GET'&&(path==='/'||path==='/index.html'||path==='/admin'||path==='/admin.html'))return send(res,200,await readFile(join(root,path.startsWith('/admin')?'admin.html':'index.html')),'text/html; charset=utf-8');
 send(res,404,{error:'页面不存在'});
 }catch{send(res,400,{error:'请求无法处理，请稍后重试'})}
});
setInterval(()=>{for(const [k,v]of sessions)if(v.expires<Date.now())sessions.delete(k);for(const[k,v]of attempts)if(v.until<Date.now())attempts.delete(k)},60000).unref();
server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>{console.log('前台：http://localhost:'+(process.env.PORT||3000));console.log('后台：http://localhost:'+(process.env.PORT||3000)+'/admin');console.log('管理密码：使用 ADMIN_PASSWORD 环境变量，或查看 data/admin-password.txt')});
