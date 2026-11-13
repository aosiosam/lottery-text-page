export const displayDefaults={displayMode:'manual',manualEnabled:false,manualDate:null,publishTime:'22:00'};
export function displayAllowed(settings,now=new Date()){
 if(settings.displayMode==='manual'){const date=new Date(now.getTime()+8*3600000).toISOString().slice(0,10);return settings.manualEnabled===true&&settings.manualDate===date;}
 if(settings.displayMode!=='scheduled'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.publishTime||''))return false;
 const bj=new Date(now.getTime()+8*3600000);const time=String(bj.getUTCHours()).padStart(2,'0')+':'+String(bj.getUTCMinutes()).padStart(2,'0');return time>=settings.publishTime;
}
