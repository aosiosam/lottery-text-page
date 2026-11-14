export const entryOrigins=['https://ingenstream.cn'];
export const healthMarker='SVITLA-TEXT-READY-v1';
export function createEntrySelector(probe=async origin=>{
 const r=await fetch(origin+'/api/entry-health',{signal:AbortSignal.timeout(3500),redirect:'error',headers:{'Cache-Control':'no-cache'}});
 return r.ok&&(await r.text()).trim()===healthMarker;
},now=Date.now){
 let cache=null,inflight=null;
 return async()=>{
  if(entryOrigins.length===1)return entryOrigins[0];
  if(cache&&cache.until>now())return cache.origin;
  if(inflight)return inflight;
  inflight=(async()=>{
   const results=await Promise.all(entryOrigins.map(async origin=>{try{return await probe(origin)}catch{return false}}));
   const origin=entryOrigins.find((_,i)=>results[i])||null;
   cache={origin,until:now()+(origin?15000:3000)};return origin;
  })().finally(()=>inflight=null);
  return inflight;
 };
}
