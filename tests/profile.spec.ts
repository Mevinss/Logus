import {test,expect} from '@playwright/test';
import {launchFixture,teacherLogin} from './fixture';
test('profile persists language/theme/name, validates password and revokes other sessions',async({browser})=>{
 const fixture=await launchFixture();const first=await browser.newContext(),other=await browser.newContext();
 try{
  for(const context of [first,other])expect((await context.request.post(fixture.url+'/api/login',{data:teacherLogin})).ok()).toBeTruthy();
  const group=await first.request.post(fixture.url+'/api/groups',{data:{name:'Profile class'}});expect(group.ok()).toBeTruthy();
  const prefs={name:'Aida Teacher',language:'en',theme:'dark',timeZone:'Europe/London'};
  const bad=await first.request.patch(fixture.url+'/api/profile',{data:{...prefs,currentPassword:'wrong-password',newPassword:'new-profile-password'}});expect(bad.status()).toBe(400);expect((await bad.json()).error).toBe('profile.wrongPassword');
  const invalidZone=await first.request.patch(fixture.url+'/api/profile',{data:{...prefs,timeZone:'Invalid/Zone'}});expect(invalidZone.status()).toBe(400);
  const valid=await first.request.patch(fixture.url+'/api/profile',{data:{...prefs,currentPassword:teacherLogin.password,newPassword:'new-profile-password'}});expect(valid.ok(),await valid.text()).toBeTruthy();
  expect((await other.request.get(fixture.url+'/api/me')).status()).toBe(401);
  expect((await first.request.get(fixture.url+'/api/profile')).ok()).toBeTruthy();
  const page=await first.newPage();await page.goto(fixture.url);
  await expect(page.getByRole('button',{name:'Profile & preferences',exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.getByRole('button',{name:'Classes',exact:true}).click();await expect(page.getByRole('heading',{name:'Classes',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Profile & preferences',exact:true}).click();await expect(page.getByText('Available classes: Profile class',{exact:true})).toBeVisible();
  await page.getByLabel('Interface language',{exact:true}).selectOption('kk');await expect(page.getByRole('heading',{name:'Сыныптар',exact:true})).toBeVisible();await page.getByRole('button',{name:'Баптауларды сақтау'}).click();await expect(page.getByText('Баптаулар сақталды',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Жабу',exact:true}).click();await page.getByRole('button',{name:/Profile class.*Сыныпты ашу/}).click();await page.getByRole('button',{name:'Талдау',exact:true}).click();await expect(page.getByRole('heading',{name:'Сынып талдауы',exact:true})).toBeVisible();
  await fixture.restart();await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','kk');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await first.request.post(fixture.url+'/api/logout',{data:{}});expect((await first.request.post(fixture.url+'/api/login',{data:teacherLogin})).status()).toBe(401);expect((await first.request.post(fixture.url+'/api/login',{data:{...teacherLogin,password:'new-profile-password'}})).ok()).toBeTruthy();
  const stored=await (await first.request.get(fixture.url+'/api/profile')).json();expect(stored.name).toBe(prefs.name);expect(stored.language).toBe('kk');expect(stored.theme).toBe('dark');expect(stored.timeZone).toBe('Europe/London');
 }finally{await first.close();await other.close();await fixture.cleanup();}
});
test('anonymous preferences persist and 360px layout stays within viewport',async({browser})=>{
 const fixture=await launchFixture(),context=await browser.newContext({viewport:{width:360,height:800}});
 try{const page=await context.newPage();await page.goto(fixture.url);await page.getByText('Профиль и настройки',{exact:true}).click();await page.getByLabel('Язык интерфейса',{exact:true}).selectOption('en');await page.getByLabel('Theme',{exact:true}).selectOption('dark');await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.getByText('Profile & preferences',{exact:true}).click();await page.getByLabel('Interface language',{exact:true}).selectOption('kk');await expect(page.getByRole('heading',{name:'Қайта қош келдіңіз'})).toBeVisible();await page.getByLabel('Тақырып',{exact:true}).selectOption('light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}finally{await context.close();await fixture.cleanup();}
});
