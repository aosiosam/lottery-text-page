export function beijingDate(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function classify(payload,now=new Date()) {
  const today=beijingDate(now),d=payload?.data;
  if(payload?.code!==10000||payload?.subCode!==10000||!d||Number(d.lotteryType)!==2)throw Error('开奖接口返回内容无法确认');
  const drawDate=String(d.lotteryTime||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)||!d.period)throw Error('开奖日期或期号缺失');
  const list=d.numberList;
  const valid=n=>n&&/^\d{1,2}$/.test(String(n.number))&&Number(n.number)>=1&&Number(n.number)<=49&&Number(n.color)>0;
  const complete=drawDate===today&&Array.isArray(list)&&list.length===7&&list.every(valid)&&new Set(list.map(n=>Number(n.number))).size===7;
  return {today,drawDate,period:d.period,state:complete?'complete':'pending',special:drawDate===today&&valid(list?.[6])?list[6].number:null,numbers:complete?list.map(n=>String(n.number).padStart(2,'0')):[]};
}
