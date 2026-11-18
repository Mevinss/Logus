import { Temporal } from '@js-temporal/polyfill';
import { all, one, run, transaction, fail, found, required, str, id, ownedGroup, ownedLesson, ownedRun, type Row } from './server-core';
type User = {id:string;name:string;role:string};
export function occurrences(body: Row) {
 let start, end;
 try {
  const zone = required(body.timezone, 100);
  start = Temporal.PlainDateTime.from(required(body.start, 30)).toZonedDateTime(zone, {disambiguation:'reject'});
  end = Temporal.PlainDateTime.from(required(body.end, 30)).toZonedDateTime(zone, {disambiguation:'reject'});
 } catch { fail(400,'calendar.invalidTime'); }
 if (Temporal.ZonedDateTime.compare(end,start)<=0 || end.epochMilliseconds-start.epochMilliseconds>7*86400000) fail(400,'calendar.invalidTime');
 const days = body.weekdays ?? [];
 if (!Array.isArray(days) || days.some((d:unknown)=>!Number.isInteger(d)||Number(d)<1||Number(d)>7)) fail(400,'calendar.invalidRecurrence');
 let until = start.toPlainDate();
 if(days.length) {
  try { until=Temporal.PlainDate.from(body.until); } catch { fail(400,'calendar.invalidRecurrence'); }
  if(Temporal.PlainDate.compare(until,start.toPlainDate())<0 || Temporal.PlainDate.compare(until,start.toPlainDate().add({days:366}))>0) fail(400,'calendar.invalidRecurrence');
 }
 const durationDays = start.toPlainDate().until(end.toPlainDate()).days;
 const result=[];
 for(let date=start.toPlainDate(); Temporal.PlainDate.compare(date,until)<=0;date=date.add({days:1})) {
  if(days.length && !days.includes(date.dayOfWeek)) continue;
  try {
   const a=date.toPlainDateTime(start.toPlainTime()).toZonedDateTime(start.timeZoneId,{disambiguation:'reject'});
   const b=date.add({days:durationDays}).toPlainDateTime(end.toPlainTime()).toZonedDateTime(start.timeZoneId,{disambiguation:'reject'});
   if(Temporal.ZonedDateTime.compare(b,a)<=0) fail(400,'calendar.invalidTime');
   result.push({starts:new Date(a.epochMilliseconds).toISOString(),ends:new Date(b.epochMilliseconds).toISOString()});
  } catch {fail(400,'calendar.invalidTime');}
 }
 if(!result.length) fail(400,'calendar.invalidRecurrence');
 return result;
}
const stamp=(s:string)=>new Date(s).toISOString().replace(/[-:]/g,'').replace('.000','');
const escapeIcs=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
export function calendarIcs(events:Row[],base:string) {
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Logus//Class schedule//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 // RDATE periods are standard recurrence sets: exact UTC boundaries also retain DST and edits.
 const groups=new Map<string,Row[]>();
 for(const event of events){const key=JSON.stringify([event.series||event.id,event.title,event.description,event.cancelled,event.run]);groups.set(key,[...(groups.get(key)||[]),event]);}
 for(const group of groups.values()) {
  const e=group[0];
  lines.push('BEGIN:VEVENT',`UID:${e.id}@logus`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(e.starts)}`,`DTEND:${stamp(e.ends)}`,`SUMMARY:${escapeIcs(e.title)}`,`DESCRIPTION:${escapeIcs(e.description+'\n'+base+'/student'+(e.run?'/'+e.run:''))}`,`STATUS:${e.cancelled?'CANCELLED':'CONFIRMED'}`);
  if(group.length>1)lines.push('RDATE;VALUE=PERIOD:'+group.slice(1).map(r=>stamp(r.starts)+'/'+stamp(r.ends)).join(','));
  lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return lines.flatMap(line=>{const chunks=[];let part='';for(const char of line){if(Buffer.byteLength(part+char)>73){chunks.push(part);part=' ';}part+=char;}chunks.push(part);return chunks;}).join('\r\n')+'\r\n';
}
function visible(user:User,eventId:string) {
 const event=found(one('SELECT e.*,g.name AS groupName FROM calendar_events e JOIN groups g ON g.id=e.grp WHERE e.id=?',eventId));
 if(user.role==='teacher') { if(event.teacher!==user.id) fail(403,'calendar.forbidden'); }
 else if(!one('SELECT id FROM students WHERE id=? AND grp=?',user.id,event.grp)) fail(403,'calendar.forbidden');
 return event;
}
function dto(e:Row,user:User,base:string) {
 const accessibleRun=e.run && (user.role==='teacher'||one('SELECT run FROM assignments WHERE run=? AND student=?',e.run,user.id)) ? e.run:null;
 const link=base+'/student'+(accessibleRun?'/'+accessibleRun:'');
 const params=new URLSearchParams({action:'TEMPLATE',text:e.title,dates:stamp(e.starts)+'/'+stamp(e.ends),details:e.description+'\n'+link,ctz:e.timezone});
 return {...e,run:accessibleRun,googleUrl:'https://calendar.google.com/calendar/render?'+params};
}
async function input(req:Request) {const raw=await req.text();if(raw.length>30000)fail(413,'calendar.invalid');let b;try{b=JSON.parse(raw);}catch{fail(400,'calendar.invalid');}if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'calendar.invalid');return b;}
export async function calendarDispatch(req:Request,parts:string[],user:User,base:string):Promise<Response|undefined> {
 if(parts[0]!=='calendar')return;
 const url=new URL(req.url), eventId=parts[1];
 if(req.method==='GET'&&eventId==='options') {
  if(user.role!=='teacher')fail(403,'calendar.forbidden');
  return Response.json({groups:all('SELECT DISTINCT g.id,g.name FROM groups g LEFT JOIN subject_teachers s ON s.grp=g.id WHERE g.teacher=? OR s.teacher=?',user.id,user.id),runs:all('SELECT r.id,r.grp,r.lesson,r.body FROM runs r JOIN lessons l ON l.id=r.lesson WHERE l.teacher=?',user.id).map(r=>({...r,title:JSON.parse(r.body).title,body:undefined})),lessons:all('SELECT id,body FROM lessons WHERE teacher=?',user.id).map(l=>({id:l.id,title:JSON.parse(l.body).title}))});
 }
 if(req.method==='GET'&&!eventId) {
  const from=url.searchParams.get('from')||new Date(Date.now()-31*86400000).toISOString(),to=url.searchParams.get('to')||new Date(Date.now()+90*86400000).toISOString();
  if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)-Date.parse(from)>370*86400000||Date.parse(to)<=Date.parse(from))fail(400,'calendar.invalid');
  const events=user.role==='teacher'?all('SELECT e.*,g.name AS groupName FROM calendar_events e JOIN groups g ON g.id=e.grp WHERE e.teacher=? AND e.ends>? AND e.starts<? ORDER BY e.starts',user.id,new Date(from).toISOString(),new Date(to).toISOString()):all('SELECT e.*,g.name AS groupName FROM calendar_events e JOIN groups g ON g.id=e.grp JOIN students s ON s.grp=e.grp WHERE s.id=? AND e.ends>? AND e.starts<? ORDER BY e.starts',user.id,new Date(from).toISOString(),new Date(to).toISOString());
  return Response.json({events:events.map(e=>dto(e,user,base))});
 }
 if(req.method==='GET'&&eventId) {
  const event=visible(user,eventId);
  if(parts[2]==='ics') {const events=url.searchParams.get('series')==='1'?(user.role==='teacher'?all('SELECT * FROM calendar_events WHERE series=? AND teacher=? ORDER BY starts',event.series,user.id):all('SELECT e.* FROM calendar_events e JOIN students s ON s.grp=e.grp WHERE e.series=? AND s.id=? ORDER BY e.starts',event.series,user.id)):[event];return new Response(calendarIcs(events.map(e=>dto(e,user,base)),base),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="logus.ics"'}});}
  if(parts[2]==='material') {if(!event.lesson)fail(404,'calendar.invalid');const lesson=JSON.parse(found(event.run?one('SELECT body FROM runs WHERE id=?',event.run):one('SELECT body FROM lessons WHERE id=?',event.lesson)).body);return Response.json({title:lesson.title,pages:user.role==='student'&&Array.isArray(lesson.selectedPages)?lesson.pages.filter((p:{id:number})=>lesson.selectedPages.includes(p.id)):lesson.pages,instruction:lesson.instruction});}
  return Response.json(dto(event,user,base));
 }
 if(user.role!=='teacher')fail(403,'calendar.forbidden');
 if(req.method==='DELETE'&&eventId) {const event=visible(user,eventId);if(url.searchParams.get('scope')==='future')run('UPDATE calendar_events SET cancelled=1 WHERE series=? AND starts>=?',event.series,event.starts);else run('UPDATE calendar_events SET cancelled=1 WHERE id=?',eventId);return Response.json({ok:true});}
 if(req.method!=='POST'&&req.method!=='PATCH')return;
 const body=await input(req),old=eventId?visible(user,eventId):null;
 if((req.method==='PATCH'&&!old)||(req.method==='POST'&&old))fail(400,'calendar.invalid');
 const grp=required(body.grp,100);ownedGroup(user.id,grp);
 const lesson=body.lesson?required(body.lesson,100):null,runId=body.run?required(body.run,100):null;
 if(lesson)ownedLesson(user.id,lesson);
 if(runId){const r=ownedRun(user.id,runId);if(r.grp!==grp||(lesson&&r.lesson!==lesson))fail(400,'calendar.invalidBinding');}
 const title=required(body.title,200),subject=str(body.subject||'',200),description=str(body.description||'',5000);
 const slots=occurrences({...body,weekdays:old&&body.scope!=='future'?[]:body.weekdays});
 const series=old&&body.scope!=='future'?old.series:id();
 const conflicts:string[]=[];
 transaction(()=>{
  if(old){if(body.scope==='future')run('UPDATE calendar_events SET cancelled=1 WHERE series=? AND starts>=?',old.series,old.starts);else run('DELETE FROM calendar_events WHERE id=?',old.id);}
  for(const slot of slots){if(one('SELECT id FROM calendar_events WHERE grp=? AND cancelled=0 AND starts<? AND ends>?',grp,slot.ends,slot.starts))conflicts.push(slot.starts);
   run('INSERT INTO calendar_events(id,teacher,grp,series,title,subject,description,starts,ends,timezone,lesson,run,recurrence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',old&&body.scope!=='future'?old.id:id(),user.id,grp,series,title,subject,description,slot.starts,slot.ends,body.timezone,lesson|| (runId?ownedRun(user.id,runId).lesson:null),runId,JSON.stringify({weekdays:body.weekdays||[],until:body.until||null}));
  }
 });
 return Response.json({ok:true,count:slots.length,conflicts});
}
