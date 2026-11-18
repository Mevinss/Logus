import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {all,one,run,transaction,required,fail,cookieToken,type Row} from './server-core';
export async function profileDispatch(req:Request,parts:string[],user:Row):Promise<Response|undefined>{
 if(parts[0] !== 'profile') return;
 const method=req.method;
 if(method==='GET'){
  const preferences=one('SELECT language,theme,time_zone AS timeZone FROM profile_preferences WHERE role=? AND user=?',user.role,user.id)||{language:'ru',theme:'system',timeZone:'Asia/Qyzylorda'};
  const groups=user.role==='teacher'?all('SELECT DISTINCT g.id,g.name FROM groups g LEFT JOIN subject_teachers s ON s.grp=g.id WHERE g.teacher=? OR s.teacher=?',user.id,user.id):all('SELECT g.id,g.name FROM groups g JOIN students s ON s.grp=g.id WHERE s.id=?',user.id);
  return Response.json({...user,...preferences,groups},{headers:{'Cache-Control':'no-store'}});
 }
 if(method!=='PATCH') fail(405,'profile.method');
 const data=await req.json();
 const name=required(data.name,120);
 if(!['ru','kk','en'].includes(data.language)||!['light','dark','system'].includes(data.theme)) fail(400,'profile.invalid');
 const timeZone=required(data.timeZone,100);
 try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{fail(400,'profile.invalidZone');}
 let password:{salt:string;hash:string}|undefined;
 if(data.newPassword){
  if(user.role!=='teacher') fail(403,'profile.teacherOnly');
  const previous=required(data.currentPassword,4096),next=required(data.newPassword,4096);
  if(next.length<12) fail(400,'profile.passwordLength');
  const teacher=one('SELECT salt,hash FROM teachers WHERE id=?',user.id)!;
  if(!timingSafeEqual(scryptSync(previous,teacher.salt,64),Buffer.from(teacher.hash,'hex'))) fail(400,'profile.wrongPassword');
  const salt=randomBytes(16).toString('hex'); password={salt,hash:scryptSync(next,salt,64).toString('hex')};
 }
 transaction(()=>{
  run(`UPDATE ${user.role==='teacher'?'teachers':'students'} SET name=? WHERE id=?`,name,user.id);
  run('INSERT INTO profile_preferences(role,user,language,theme,time_zone) VALUES(?,?,?,?,?) ON CONFLICT(role,user) DO UPDATE SET language=excluded.language,theme=excluded.theme,time_zone=excluded.time_zone',user.role,user.id,data.language,data.theme,timeZone);
  if(password){run('UPDATE teachers SET salt=?,hash=? WHERE id=?',password.salt,password.hash,user.id);run('DELETE FROM sessions WHERE role=? AND user=? AND token<>?',user.role,user.id,cookieToken(req));}
 });
 return Response.json({name,language:data.language,theme:data.theme,timeZone});
}
