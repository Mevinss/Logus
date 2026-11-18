import {test,expect} from '@playwright/test';
import {launchFixture,teacherLogin,choice,quote} from './fixture';
test('calendar teacher creation reaches student, exports copies, survives restart and fits mobile',async({browser},testInfo)=>{
 test.setTimeout(120000);
 const fixture=await launchFixture(),teacher=await browser.newContext(),student=await browser.newContext({viewport:{width:360,height:780}});
 try{
  teacher.setDefaultTimeout(15000);student.setDefaultTimeout(15000);
  const post=async(path:string,data:unknown)=>{const r=await teacher.request.post(fixture.url+'/api/'+path,{data});expect(r.status(),await r.text()).toBe(200);return r.json();};
  await post('login',teacherLogin);const group=await post('groups',{name:'Calendar class'});const roster=await post('groups/'+group.id+'/students',{name:'Calendar pupil'});
  const lesson=await post('lessons',{title:'Calendar lesson',text:quote});
  const patch=await teacher.request.patch(fixture.url+'/api/lessons/'+lesson.id,{data:{questions:[{...choice,id:'calendar-q1',sourceId:1}],settings:{durationMinutes:null,opensAt:null,dueAt:null,resultMode:'immediate'}}});expect(patch.ok()).toBeTruthy();
  const run=await post('lessons/'+lesson.id+'/publish',{groupId:group.id});
  const page=await teacher.newPage();await page.goto(fixture.url);await page.getByRole('button',{name:'Расписание класса',exact:true}).first().click();
  await page.getByRole('button',{name:'Назначить занятие',exact:true}).click();
  await page.getByLabel('Класс',{exact:true}).last().selectOption(group.id);
  await page.getByLabel('Название занятия').fill('Scheduled science');await page.getByLabel('Предмет',{exact:true}).fill('Science');
  const today=new Date().toISOString().slice(0,10);
  await page.getByLabel('Начало',{exact:true}).fill(today+'T09:00');await page.getByLabel('Окончание',{exact:true}).fill(today+'T10:00');await page.getByLabel('Часовой пояс события').fill('UTC');
  await page.getByLabel('Опубликованный тест').selectOption(run.id);await page.getByRole('button',{name:'Сохранить расписание'}).click();
  await expect(page.getByText('Расписание сохранено.',{exact:true})).toBeVisible();await expect(page.locator('.calendar-event').filter({hasText:'Scheduled science'})).toBeVisible();
  const join=await student.request.post(fixture.url+'/api/join',{data:{token:roster.students[0].inviteUrl.split('/').pop()}});expect(join.ok()).toBeTruthy();
  const pupil=await student.newPage();await pupil.goto(fixture.url+'/student');await pupil.getByRole('button',{name:'Расписание',exact:true}).click();
  await pupil.locator('.calendar-event').filter({hasText:'Scheduled science'}).click();await expect(pupil.getByRole('heading',{name:'Scheduled science'})).toBeVisible();
  const google=pupil.getByRole('link',{name:'Добавить в Google Calendar'});const googleUrl=new URL((await google.getAttribute('href'))!);expect(googleUrl.hostname).toBe('calendar.google.com');expect(googleUrl.searchParams.get('text')).toBe('Scheduled science');expect(googleUrl.searchParams.get('dates')).toContain('T090000Z/');expect(googleUrl.searchParams.get('details')).toContain('/student/'+run.id);
  const icsPath=await pupil.getByRole('link',{name:'Скачать .ics',exact:true}).getAttribute('href');const ics=await student.request.get(fixture.url+icsPath);expect(ics.headers()['content-type']).toContain('text/calendar');expect(await ics.text()).toContain('SUMMARY:Scheduled science');
  await expect(pupil.getByText(/В календарь добавляется копия/)).toBeVisible();expect(await pupil.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await pupil.screenshot({path:testInfo.outputPath('calendar-mobile.png'),fullPage:true});
  await pupil.getByRole('button',{name:'Читать материал'}).click();await expect(pupil.getByText(quote,{exact:true})).toBeVisible();
  await fixture.restart();await pupil.reload();await pupil.getByRole('button',{name:'Расписание',exact:true}).click();await expect(pupil.locator('.calendar-event').filter({hasText:'Scheduled science'})).toBeVisible();
  await pupil.locator('.calendar-event').filter({hasText:'Scheduled science'}).click();await pupil.getByRole('link',{name:'Открыть тест',exact:true}).click();await expect(pupil).toHaveURL(new RegExp('/student/'+run.id+'$'));
 }finally{await teacher.close();await student.close();await fixture.cleanup();}
});
