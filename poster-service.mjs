export const posterDefaults={targetUrl:'https://svitla.it.com',x:22,y:67,size:25};
function posterUrl(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.href.length>900)return null;return u.href}catch{return null}}
function posterPng(data){const a=new Uint8Array(data);if(a.length<24||[137,80,78,71,13,10,26,10].some((v,i)=>a[i]!==v))return false;const d=new DataView(a.buffer,a.byteOffset,a.byteLength),w=d.getUint32(16),h=d.getUint32(20);return w>=32&&h>=32&&w<=4096&&h<=4096&&w*h<=12000000}
async function posterBytes(req,limit=8*1024*1024){const reader=req.body?.getReader();if(!reader)throw Error();const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('too large')}chunks.push(value)}const data=new Uint8Array(size);let p=0;for(const c of chunks){data.set(c,p);p+=c.length}return data}
async function posterConfig(env,date){const o=await env.BUCKET.get('poster/'+date+'/settings.json');return {...posterDefaults,...(o?await o.json():{}),targetUrl:'https://svitla.it.com/'+date,date}}
export async function handlePoster(req,env,json,headers){
 const url=new URL(req.url),path=url.pathname;
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),date=url.searchParams.get('date')||today;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>today)return json({error:'日期无效'},400);
 if(req.method==='POST'&&date!==today)return json({error:'已跨天，请刷新页面后保存今天的图片；历史图片不允许修改'},409);
 if(path==='/api/admin/poster/history'&&req.method==='GET'){const o=await env.BUCKET.get('poster/days.json');const days=o?await o.json():[];return json({items:days.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().map(d=>({date:d,url:'/api/admin/poster/composite?date='+d}))})}

 if(path==='/api/admin/poster/settings'){
  if(req.method==='GET')return json(await posterConfig(env,date));
  if(req.method==='POST'){const raw=await req.text();if(raw.length>5000)return json({error:'设置内容过长'},400);const d=JSON.parse(raw),targetUrl=posterUrl(d.targetUrl);if(targetUrl!=='https://svitla.it.com/'+today||!['x','y','size'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k]))||d.x<0||d.x>100||d.y<0||d.y>100||d.size<16||d.size>75)return json({error:'请填写有效网址，并检查二维码位置和大小'},400);await env.BUCKET.put('poster/'+date+'/settings.json',JSON.stringify({targetUrl,x:d.x,y:d.y,size:d.size}));return json({ok:true})}
 }
 if(['/api/admin/poster/background','/api/admin/poster/composite'].includes(path)){
  const kind=path.endsWith('/background')?'background':'composite',key='poster/'+date+'/'+kind+'.png';
  if(req.method==='GET'||req.method==='HEAD'){const obj=await env.BUCKET.get(key);if(!obj)return json({error:'尚未保存图片'},404);return new Response(req.method==='HEAD'?null:obj.body,{headers:{...headers,'Content-Type':'image/png',...(kind==='composite'?{'Content-Disposition':'attachment; filename="hidden-qr-'+date+'.png"'}:{})}})}
  if(req.method==='POST'){let bytes;try{bytes=await posterBytes(req)}catch{return json({error:'图片不能超过 8MB'},413)}if(!posterPng(bytes))return json({error:'请上传有效的 PNG 图片，最大 4096 像素'},400);await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/png'}});if(kind==='composite'){const o=await env.BUCKET.get('poster/days.json'),days=o?await o.json():[];if(!days.includes(date))await env.BUCKET.put('poster/days.json',JSON.stringify([...days,date].sort()))}return json({ok:true,date})}
 }
 if(path==='/api/admin/poster/qrcode'&&req.method==='GET'){
  const target=posterUrl(url.searchParams.get('target')||'');if(!target)return json({error:'请输入完整的 http 或 https 网址，最长 900 字符'},400);const historyMode=url.searchParams.get('history')==='1';if(target!=='https://svitla.it.com/'+(historyMode?date:today))return json({error:'请刷新页面，生成对应日期页面的二维码'},409);if(historyMode&&!await env.BUCKET.get('history/'+date+'.json'))return json({error:'历史记录不存在或已删除'},404);
  const qrTarget=historyMode?target:'https://svitla.it.com/open-browser?target='+encodeURIComponent(target);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(qrTarget))),n=>n.toString(16).padStart(2,'0')).join(''),key='poster/qr/'+hash+'.png';let obj=await env.BUCKET.get(key);
  if(obj)return new Response(req.method==='HEAD'?null:obj.body,{headers:{...headers,'Content-Type':'image/png'}});
  const upstream=new URL('https://api.2dcode.biz/v1/create-qr-code');upstream.search=new URLSearchParams({data:qrTarget,size:'1024x1024',format:'png',error_correction:'H',border:'4'}).toString();
  let r;try{r=await fetch(upstream,{signal:AbortSignal.timeout(20000),redirect:'error'})}catch{return json({error:'暂时无法连接草料，请稍后重试'},502)}
  if(!r.ok)return json({error:'草料生成失败，请稍后重试'},502);
  let bytes;try{bytes=await posterBytes(r,3*1024*1024)}catch{return json({error:'草料返回图片过大'},502)}if(!posterPng(bytes))return json({error:'草料未返回有效的二维码图片'},502);
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/png'}});return new Response(bytes,{headers:{...headers,'Content-Type':'image/png'}});
 }
 return null;
}
