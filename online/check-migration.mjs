import assert from 'node:assert/strict';
import app from './dist/server/index.js';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const prefix='windows-migration-v2/';
class Bucket {
 constructor(){this.rows=new Map()}
 async put(key,value,options={}){if(options.onlyIf?.etagDoesNotMatch==='*'&&this.rows.has(key))return null;if(value instanceof ReadableStream)value=await new Response(value).arrayBuffer();const data=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);this.rows.set(key,{data,customMetadata:options.customMetadata});return{key}}
 async get(key){const r=this.rows.get(key);if(!r)return null;return{body:r.data,json:async()=>JSON.parse(new TextDecoder().decode(r.data)),arrayBuffer:async()=>r.data.buffer.slice(r.data.byteOffset,r.data.byteOffset+r.data.byteLength)}}
 async head(key){const r=this.rows.get(key);return r?{size:r.data.length}:null}
 async delete(key){this.rows.delete(key)}
 async list({prefix=''}){return{objects:[...this.rows].filter(([k])=>k.startsWith(prefix)).map(([key,v])=>({key,size:v.data.length,customMetadata:v.customMetadata})),truncated:false}}
}
const bucket=new Bucket(),root=process.argv[2];
async function load(dir,path=''){for(const f of await readdir(dir,{withFileTypes:true})){const key=path+f.name;if(f.isDirectory())await load(join(dir,f.name),key+'/');else if(key!=='admin-password.txt')await bucket.put(prefix+key,await readFile(join(dir,f.name)))}}
if(root)await load(root);
const env={BUCKET:bucket,ADMIN_PASSWORD:'test-only'};let cookie='',csrf='';
async function request(path,method='GET',data,headers={}){const r=await app.fetch(new Request('https://test.invalid'+path,{method,headers:{cookie,'content-type':'application/json','x-csrf-token':csrf,...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);return r}
let r=await request('/api/login','POST',{username:'admin',password:'test-only'});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];
let settings=await(await request('/api/admin/settings')).json();csrf=settings.csrf;
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
r=await request('/api/admin/settings','POST',{...settings,afterText:'first',displayMode:'manual',manualEnabled:false,publishTime:'22:00'});assert.equal(r.status,200);
assert.equal((await(await request('/api/display?date='+today)).json()).state,'pending');
r=await request('/api/admin/poster/text?date='+today,'POST',{text:'edited before display'});assert.equal(r.status,200);
settings=await(await request('/api/admin/settings')).json();assert.equal(settings.afterText,'edited before display');assert.equal(settings.manualEnabled,false);
r=await request('/api/admin/settings','POST',{...settings,manualEnabled:true,publishToday:true});assert.equal(r.status,200);
assert.equal((await(await request('/api/display?date='+today)).json()).text,'edited before display');
await request('/api/admin/poster/text?date='+today,'POST',{text:'edited after display'});
assert.equal((await(await request('/api/display?date='+today)).json()).text,'edited after display');
settings=await(await request('/api/admin/settings')).json();await request('/api/admin/settings','POST',{...settings,manualEnabled:false});assert.equal((await(await request('/api/display?date='+today)).json()).state,'pending');
assert.equal((await request('/poster')).status,200);assert.equal((await request('/api/admin/history')).status,200);
r=await request('/open-browser?target=https%3A%2F%2Feharmony.me%2F'+today,'GET',undefined,{'user-agent':'Android MicroMessenger/8.0'});assert.match(r.headers.get('content-disposition'),/attachment/);
assert.equal((await request('/api/admin/settings','POST',{...settings,manualEnabled:false},{'x-csrf-token':'wrong'})).status,403);
const history=await(await request('/api/admin/poster/history')).json();for(const item of history.items){r=await request(item.url);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png')}
r=await request('/');const html=await r.text();assert.match(html,/setInterval\(update,1000\)/);assert.match(html,/数据加载中/);
console.log('PASS: imported data; durable login/CSRF; poster/history images; edit before/after display; today on/off; Android attachment; no-cache one-second page');
