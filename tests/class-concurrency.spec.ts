import {test,expect} from '@playwright/test';
import {launchFixture,teacherLogin,choice,quote} from './fixture';

test('a class starts and submits concurrently without duplicate attempts or leaked results',async({playwright})=>{
  const fixture=await launchFixture();
  const teacher=await playwright.request.newContext();
  const pupils:Awaited<ReturnType<typeof playwright.request.newContext>>[]=[];
  try{
    const post=async(path:string,data:unknown)=>{const response=await teacher.post(fixture.url+'/api/'+path,{data});expect(response.ok(),await response.text()).toBeTruthy();return response.json()};
    await post('login',teacherLogin);
    const group=await post('groups',{name:'Concurrent class'});
    for(let i=0;i<12;i++)await post(`groups/${group.id}/students`,{name:`Pupil ${i}`});
    const roster=await (await teacher.get(fixture.url+`/api/groups/${group.id}`)).json();
    const lesson=await post('lessons',{title:'Class check',text:quote});
    const patch=await teacher.patch(fixture.url+`/api/lessons/${lesson.id}`,{data:{questions:[{...choice,id:'q',sourceId:1}],settings:{durationMinutes:2,opensAt:null,dueAt:null,resultMode:'teacher'}}});expect(patch.ok()).toBeTruthy();
    const run=await post(`lessons/${lesson.id}/publish`,{groupId:group.id});
    await Promise.all(roster.group.students.map(async(student:{inviteUrl:string})=>{
      const pupil=await playwright.request.newContext();pupils.push(pupil);
      expect((await pupil.post(fixture.url+'/api/join',{data:{token:student.inviteUrl.split('/').pop()}})).ok()).toBeTruthy();
      const endpoint=fixture.url+`/api/student/${run.id}`;
      expect((await pupil.post(endpoint+'/start',{data:{}})).ok()).toBeTruthy();
      expect((await pupil.patch(endpoint+'/answers',{data:{answers:{q:0}}})).ok()).toBeTruthy();
      const responses=await Promise.all([pupil.post(endpoint+'/submit',{data:{}}),pupil.post(endpoint+'/submit',{data:{}})]);
      for(const response of responses){expect(response.ok()).toBeTruthy();expect(await response.json()).not.toHaveProperty('score')}
    }));
    const report=await (await teacher.get(fixture.url+`/api/groups/${group.id}`)).json();
    expect(report.works).toHaveLength(12);expect(report.runs[0].submitted).toBe(12);expect(report.runs[0].averagePercent).toBe(100);
    expect((await post(`runs/${run.id}/results`,{})).published).toBe(12);
    for(const pupil of pupils){const result=await (await pupil.get(fixture.url+`/api/student/${run.id}`)).json();expect(result.item.score).toBe(1)}
  }finally{await teacher.dispose();await Promise.all(pupils.map(p=>p.dispose()));await fixture.cleanup()}
});
