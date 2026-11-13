// Storage adapter for the existing Windows application's request handlers.
// Durable private data lives in R2; no writable local filesystem is required.
export const storagePrefix='windows-migration-v2/';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const randomToken=(n=32)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
const join=(...parts)=>parts.join('/').replace(/\/+/g,'/');
const historyLocks=new Map();let writing=false;
function equal(a,b){a=encoder.encode(String(a));b=encoder.encode(String(b));let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a[i]||0)^(b[i]||0);return d===0}
function missing(){const e=new Error('Not found');e.code='ENOENT';return e}
function bytes(value){return typeof value==='string'?encoder.encode(value):value}
function buffer(value){const out=new Uint8Array(value);out.toString=()=>decoder.decode(out);return out}
function keyOf(path){if(!path.startsWith('/app/data/'))throw Error('Invalid storage path');const key=path.slice('/app/data/'.length);if(key.split('/').some(v=>v==='..'||v==='.')||key.includes('\\'))throw Error('Invalid storage key');return key}
async function allObjects(bucket,prefix){let cursor;const objects=[];do{const p=await bucket.list({prefix,cursor,limit:1000,include:['customMetadata']});objects.push(...p.objects);cursor=p.truncated?p.cursor:undefined}while(cursor);return objects}
function persistentMap(bucket,prefix){return{async get(k){const o=await bucket.get(storagePrefix+prefix+k);return o?o.json():undefined},async set(k,v){await bucket.put(storagePrefix+prefix+k,JSON.stringify(v))},async delete(k){await bucket.delete(storagePrefix+prefix+k)}}}
function filesystem(env,assets){const temporary=new Map();return{
 async mkdir(){},
 async readFile(path,encoding){if(path in assets)return encoding?assets[path]:encoder.encode(assets[path]);const key=keyOf(path);const obj=await env.BUCKET.get(storagePrefix+key);if(!obj)throw missing();const data=await obj.arrayBuffer();return encoding?decoder.decode(data):buffer(data)},
 async writeFile(path,data,options){const key=keyOf(path),value=bytes(data);if(key.endsWith('.tmp')){temporary.set(key,value);return}const result=await env.BUCKET.put(storagePrefix+key,value,options?.flag==='wx'?{onlyIf:{etagDoesNotMatch:'*'}}:undefined);if(!result){const e=new Error('Already exists');e.code='EEXIST';throw e}},
 async rename(source,destination){const from=keyOf(source),to=keyOf(destination);if(temporary.has(from)){await env.BUCKET.put(storagePrefix+to,temporary.get(from));temporary.delete(from);return}const obj=await env.BUCKET.get(storagePrefix+from);if(!obj)throw missing();await env.BUCKET.put(storagePrefix+to,obj.body);await env.BUCKET.delete(storagePrefix+from)},
 async unlink(path){const key=keyOf(path);if(!await env.BUCKET.head(storagePrefix+key))throw missing();await env.BUCKET.delete(storagePrefix+key)},
 async readdir(path){const prefix=keyOf(path+'/');return(await allObjects(env.BUCKET,storagePrefix+prefix)).map(o=>o.key.slice((storagePrefix+prefix).length)).filter(v=>v&&!v.includes('/'))}
}}
function requestAdapter(original){const url=new URL(original.url),headers=Object.fromEntries(original.headers);headers.host=url.host;return{url:url.pathname+url.search,method:original.method,headers,socket:{encrypted:true,remoteAddress:original.headers.get('cf-connecting-ip')||'unknown'},async *[Symbol.asyncIterator](){if(!original.body)return;const reader=original.body.getReader();const decode=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;yield decode.decode(value,{stream:true})}const rest=decode.decode();if(rest)yield rest}}}
function responseAdapter(){return{status:200,headers:new Headers(),response:null,setHeader(k,v){this.headers.set(k,v)},writeHead(status,headers={}){this.status=status;for(const[k,v]of Object.entries(headers))this.headers.set(k,v)},end(data){this.response=new Response(data??null,{status:this.status,headers:this.headers});return this.response}}}
async function migrationRoute(original,env){
 const url=new URL(original.url);if(url.pathname==='/3ec8d8db9982067211e0d5f094bec457.txt'&&['GET','HEAD'].includes(original.method))return new Response(original.method==='HEAD'?null:'631a740406c46c99486c25ea99a2b32c19f2bb7d',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});if(!url.pathname.startsWith('/api/admin/migration/'))return null;
 const cookie=/\bsession=([a-f0-9]+)\b/.exec(original.headers.get('cookie')||'')?.[1];
 const session=cookie?await persistentMap(env.BUCKET,'sessions/').get(cookie):null;
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(!session||session.expires<Date.now())return reply({error:'请先登录'},401);
 if(original.method==='GET'&&url.pathname.endsWith('/cleanup-status')){const o=await env.BUCKET.get(storagePrefix+'migration/cleanup.json');return reply(o?await o.json():{completed:false})}
 if(original.method==='GET'&&url.pathname.endsWith('/manifest')){const objects=await allObjects(env.BUCKET,storagePrefix);return reply({items:objects.filter(o=>!o.key.slice(storagePrefix.length).startsWith('sessions/')&&!o.key.slice(storagePrefix.length).startsWith('attempts/')).map(o=>({key:o.key.slice(storagePrefix.length),size:o.size,sha256:o.customMetadata?.sha256||null}))})}
 if(original.method!=='POST'||!equal(original.headers.get('x-csrf-token')||'',session.csrf))return reply({error:'Forbidden'},403);
 if(original.headers.get('origin')&&original.headers.get('origin')!==url.origin)return reply({error:'Forbidden'},403);
 const key=url.searchParams.get('key')||'';
 if(!/^(migration\/cleanup\.json|settings\.json|history\/\d{4}-\d{2}-\d{2}\.(json|deleted)|poster\/(background\.png|composite\.png|settings\.json|days\.json|qr\/[a-f0-9]+\.png|\d{4}-\d{2}-\d{2}\/(settings\.json|background\.png|composite\.png)))$/.test(key))return reply({error:'Invalid key'},400);
 const data=await original.arrayBuffer();if(data.byteLength>9*1024*1024)return reply({error:'Too large'},413);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==url.searchParams.get('sha256'))return reply({error:'Checksum mismatch'},400);
 await env.BUCKET.put(storagePrefix+key,data,{customMetadata:{sha256:hash}});return reply({ok:true,key,sha256:hash});
}
