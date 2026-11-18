import {test,expect} from "@playwright/test";
import {launchFixture,teacherLogin,choice,open,quote} from "./fixture";

test("timed test hides results until teacher publishes and settings persist in three languages",async({browser},testInfo)=>{
  const fixture=await launchFixture();
  const teacher=await browser.newContext({viewport:{width:1366,height:900}});
  const pupil=await browser.newContext({viewport:{width:360,height:780}});
  try{
    const post=async(path:string,data:unknown)=>{
      const r=await teacher.request.post(fixture.url+"/api/"+path,{data});
      expect(r.ok(),await r.text()).toBeTruthy();return r.json();
    };
    await post("login",teacherLogin);
    const g=await post("groups",{name:"8А"});
    const roster=await post(`groups/${g.id}/students`,{name:"Аружан"});
    const student=roster.students[0];
    const l=await post("lessons",{title:"Конденсация",text:quote});
    const q1={...choice,id:"closed",sourceId:1,explanation:"Пар превращается в жидкость.",optionExplanations:["Это жидкость.","Пар превращается в капли.","В тексте нет замерзания."]};
    const q2={...open,id:"explain",sourceId:1,explanation:"Назовите переход пара в жидкость."};
    const save=await teacher.request.patch(fixture.url+`/api/lessons/${l.id}`,{data:{questions:[q1,q2],settings:{durationMinutes:2,opensAt:null,dueAt:null,resultMode:"teacher"}}});
    expect(save.ok()).toBeTruthy();
    const r=await post(`lessons/${l.id}/publish`,{groupId:g.id});
    const page=await pupil.newPage();await page.goto(student.inviteUrl);
    await expect.poll(async()=>(await pupil.request.get(fixture.url+"/api/me")).status()).toBe(200);
    await page.goto(r.url);
    expect((await (await pupil.request.get(fixture.url+`/api/student/${r.id}`)).json()).questions).toEqual([]);
    await page.getByRole("button",{name:/Перейти к заданиям/}).click();
    await expect(page.getByRole("radio",{name:"Капли",exact:true})).toBeVisible();
    const before=await (await pupil.request.get(fixture.url+`/api/student/${r.id}`)).json();
    await page.getByRole("radio",{name:"Капли",exact:true}).check();
    await expect.poll(async()=> (await (await pupil.request.get(fixture.url+`/api/student/${r.id}`)).json()).answers.closed).toBe(0);
    await page.reload();await expect(page.getByRole("radio",{name:"Капли",exact:true})).toBeChecked();
    expect((await (await pupil.request.get(fixture.url+`/api/student/${r.id}`)).json()).timing.endsAt).toBe(before.timing.endsAt);
    await page.getByRole("button",{name:/Далее/}).click();
    await page.getByRole("textbox",{name:"Ваш ответ"}).fill("Пар превращается в жидкость.");
    await page.getByRole("button",{name:"Сдать работу",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Ожидает публикации"})).toBeVisible();
    let detail=await (await pupil.request.get(fixture.url+`/api/student/${r.id}`)).json();
    expect(detail.item).not.toHaveProperty("score");expect(detail.points).toEqual({});
    expect(detail.questions[0]).not.toHaveProperty("correctIndex");
    await post(`works/${r.id}/${student.id}/grade`,{points:{explain:2},comment:"Верно"});
    const desk=await teacher.newPage();await desk.goto(fixture.url);
    await desk.getByRole("button",{name:"Группы",exact:true}).first().click();
    await desk.getByRole("button",{name:/8А/}).first().click();
    await desk.getByRole("button",{name:"Занятия",exact:true}).click();
    await desk.getByRole("button",{name:"Опубликовать результаты",exact:true}).click();
    await expect(desk.getByText(/Опубликовано результатов: 1/)).toBeVisible();
    await page.reload();await expect(page.getByRole("heading",{name:"Итоговый балл"})).toBeVisible();
    await expect(page.getByText("Правильный ответ",{exact:true})).toBeVisible();
    detail=await (await pupil.request.get(fixture.url+`/api/student/${r.id}`)).json();expect(detail.item.score).toBe(3);
    for(const language of ["kk","en","ru"]){
      const pref=await pupil.request.patch(fixture.url+"/api/profile",{data:{name:"Аружан",language,theme:language==="en"?"light":"dark",timeZone:"Asia/Qyzylorda"}});
      expect(pref.ok()).toBeTruthy();await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang",language);
      await expect(page.locator("html")).toHaveAttribute("data-theme",language==="en"?"light":"dark");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
      await page.screenshot({path:testInfo.outputPath(`student-${language}.png`),fullPage:true});
    }
    await desk.screenshot({path:testInfo.outputPath("teacher-results.png"),fullPage:true});
    // Server completion uses only previously saved answers even if the client sends new ones late.
    const second=await post(`lessons/${l.id}/publish`,{groupId:g.id});
    await pupil.request.post(fixture.url+`/api/student/${second.id}/start`,{data:{}});
    await pupil.request.patch(fixture.url+`/api/student/${second.id}/answers`,{data:{answers:{closed:0}}});
    fixture.expireAttempt(second.id,student.id);
    await pupil.request.post(fixture.url+`/api/student/${second.id}/submit`,{data:{answers:{closed:2}}});
    const expired=await (await teacher.request.get(fixture.url+`/api/works/${second.id}/${student.id}`)).json();
    expect(expired.work.expired).toBe(true);expect(expired.answers.closed).toBe(0);
    await fixture.restart();
    expect((await (await pupil.request.get(fixture.url+`/api/student/${r.id}`)).json()).item.score).toBe(3);
  }finally{await teacher.close();await pupil.close();await fixture.cleanup()}
});

test('offline answers are rejected after expiry and the server keeps the last saved answer',async({browser})=>{
 const fixture=await launchFixture(),teacher=await browser.newContext(),pupil=await browser.newContext();
 try{
  const post=async(path:string,data:unknown)=>{const response=await teacher.request.post(fixture.url+'/api/'+path,{data});expect(response.ok(),await response.text()).toBeTruthy();return response.json();};
  await post('login',teacherLogin);const group=await post('groups',{name:'Offline class'});const roster=await post(`groups/${group.id}/students`,{name:'Offline pupil'});const student=roster.students[0];const lesson=await post('lessons',{title:'Offline test',text:quote});
  expect((await teacher.request.patch(fixture.url+`/api/lessons/${lesson.id}`,{data:{questions:[{...choice,id:'closed',sourceId:1}],settings:{durationMinutes:2,opensAt:null,dueAt:null,resultMode:'teacher'}}})).ok()).toBeTruthy();
  const run=await post(`lessons/${lesson.id}/publish`,{groupId:group.id});const page=await pupil.newPage();await page.goto(student.inviteUrl);
  await expect.poll(async()=>(await pupil.request.get(fixture.url+'/api/me')).status()).toBe(200);
  await page.goto(run.url);await page.getByRole('button',{name:/Перейти к заданиям/}).click();await page.getByRole('radio',{name:'Капли',exact:true}).check();
  await expect.poll(async()=> (await (await pupil.request.get(fixture.url+`/api/student/${run.id}`)).json()).answers.closed).toBe(0);
  await pupil.setOffline(true);await page.getByRole('radio',{name:'Лёд',exact:true}).check();await expect(page.getByRole('radio',{name:'Лёд',exact:true})).toBeChecked();
  fixture.expireAttempt(run.id,student.id);await pupil.setOffline(false);
  // Reload is also a supported recovery path when the connection returns.
  await page.reload();await expect(page.getByRole('heading',{name:'Ожидает публикации'})).toBeVisible();
  const result=await (await teacher.request.get(fixture.url+`/api/works/${run.id}/${student.id}`)).json();expect(result.work.expired).toBe(true);expect(result.answers.closed).toBe(0);expect(result.work.score).toBe(1);
  const late=await pupil.request.patch(fixture.url+`/api/student/${run.id}/answers`,{data:{answers:{closed:2}}});expect(late.status()).toBe(409);
  const hidden=await (await pupil.request.get(fixture.url+`/api/student/${run.id}`)).json();expect(hidden.item).not.toHaveProperty('score');expect(hidden.questions[0]).not.toHaveProperty('correctIndex');
 }finally{await teacher.close();await pupil.close();await fixture.cleanup();}
});
