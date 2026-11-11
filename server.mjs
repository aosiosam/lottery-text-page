import http from 'node:http';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {classify,beijingDate} from './lottery.mjs';
const root=dirname(fileURLToPath(import.meta.url)),dir=join(root,'data');await mkdir(dir,{recursive:true});
const settingsFile=join(dir,'settings.json');let settings={afterText:''};try{const stored=JSON.parse(await readFile(settingsFile,'utf8'));settings={afterText:typeof stored.afterText==='string'?stored.afterText:''}}catch(e){if(e.code!=='ENOENT')throw e}
let password=process.env.ADMIN_PASSWORD;
if(!password){try{password=(await readFile(join(dir,'admin-password.txt'),'utf8')).trim()}catch(e){if(e.code!=='ENOENT')throw e;password=randomBytes(12).toString('base64url');await writeFile(join(dir,'admin-password.txt'),password,{mode:0o600})}}
const sessions=new Map(),attempts=new Map();let cache=null,inflight=null,writing=false;
async function check(){
 if(cache&&Date.now()-cache.at<8000&&cache.value.today===beijingDate())return cache.value;
 if(inflight)return inflight;
 inflight=(async()=>{let value;try{const r=await fetch('https://49208.com/unite49/h5/index/lastLotteryRecord?lotteryType=2',{headers:{lotteryType:'2','Cache-Control':'no-cache'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('开奖接口暂时不可用');value=classify(await r.json())}catch{value={state:'error',today:beijingDate(),error:'无法核实当前开奖，前台持续加载。'}}cache={value,at:Date.now()};return value})().finally(()=>inflight=null);return inflight;
}
function send(res,status,data,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"});res.end(type.startsWith('application/json')?JSON.stringify(data):data)}
async function body(req){let str='';for await(const c of req){str+=c;if(Buffer.byteLength(str)>450000)throw Error('内容过长')}return JSON.parse(str||'{}')}
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
const server=http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='POST'&&req.headers.origin){if(new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'请求来源不匹配'})}
 const cookie=/\bsession=([a-f0-9]+)\b/.exec(req.headers.cookie||'')?.[1],session=sessions.get(cookie);
 const authorized=session&&session.expires>Date.now();
 if(path==='/api/login'&&req.method==='POST'){
  const ip=req.socket.remoteAddress,entry=attempts.get(ip)||{count:0,until:0};if(entry.until<Date.now())entry.count=0;if(entry.count>=10)return send(res,429,{error:'尝试过多，请 15 分钟后再试'});
  const d=await body(req);if(!equal(d.password||'',password)){entry.count++;entry.until=Date.now()+900000;attempts.set(ip,entry);return send(res,401,{error:'密码错误'})}
  attempts.delete(ip);const token=randomBytes(32).toString('hex');sessions.set(token,{expires:Date.now()+43200000,csrf:randomBytes(24).toString('hex')});res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${req.socket.encrypted?'; Secure':''}`);return send(res,200,{ok:true});
 }
 if(path.startsWith('/api/admin/')||path==='/api/logout'){
  if(!authorized)return send(res,401,{error:'请先登录'});
  if(req.method==='POST'&&!equal(req.headers['x-csrf-token']||'',session.csrf))return send(res,403,{error:'请重新登录后再操作'});
  if(path==='/api/admin/status'&&req.method==='GET')return send(res,200,await check());
  if(path==='/api/admin/settings'&&req.method==='GET')return send(res,200,{...settings,csrf:session.csrf});
  if(path==='/api/admin/settings'&&req.method==='POST'){
   const d=await body(req);if(typeof d.afterText!=='string'||d.afterText.length>50000)return send(res,400,{error:'最多 50000 字'});
   if(writing)return send(res,409,{error:'正在保存，请稍后重试'});writing=true;try{const next={afterText:d.afterText};await writeFile(settingsFile+'.tmp',JSON.stringify(next,null,2));await rename(settingsFile+'.tmp',settingsFile);settings=next}finally{writing=false}return send(res,200,{ok:true});
  }
  if(path==='/api/logout'&&req.method==='POST'){sessions.delete(cookie);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true})}
 }
 if(path==='/api/display'&&req.method==='GET'){const s=await check();return send(res,200,{state:s.state,text:s.state==='complete'?settings.afterText:''})}
 if(req.method==='GET'&&(path==='/'||path==='/index.html'||path==='/admin'||path==='/admin.html'))return send(res,200,await readFile(join(root,path.startsWith('/admin')?'admin.html':'index.html')),'text/html; charset=utf-8');
 send(res,404,{error:'页面不存在'});
 }catch{send(res,400,{error:'请求无法处理，请稍后重试'})}
});
setInterval(()=>{for(const [k,v]of sessions)if(v.expires<Date.now())sessions.delete(k);for(const[k,v]of attempts)if(v.until<Date.now())attempts.delete(k)},60000).unref();
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>{console.log('前台：http://localhost:'+(process.env.PORT||3000));console.log('后台：http://localhost:'+(process.env.PORT||3000)+'/admin');console.log('管理密码：使用 ADMIN_PASSWORD 环境变量，或查看 data/admin-password.txt')});
