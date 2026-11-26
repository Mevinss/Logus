import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Temporal } from '@js-temporal/polyfill';
import { connect } from '../lib/server-schema.mjs';
import { withCloudDatabase, cloudStorage, databaseKey, freshRead } from '../lib/server-cloud.mjs';

const teacherId='logus-demo-teacher-v1', groupId='logus-demo-class-v1';
const subjects=[
  {
    slug:'math', title:'Математика · 7 класс · Линейные уравнения', subject:'Математика',
    text:'Линейное уравнение с одной переменной можно привести к виду ax + b = 0. Чтобы сохранить равенство, к обеим частям прибавляют одно и то же число или обе части делят на одно и то же ненулевое число. В уравнении 3x + 5 = 20 вычитаем 5 из обеих частей: 3x = 15. Затем делим обе части на 3 и получаем x = 5. Проверка: 3 · 5 + 5 = 20. В уравнении 2x − 4 = 10 прибавляем 4 к обеим частям: 2x = 14, поэтому x = 7.',
    questions:[
      ['Чему равен x в уравнении 3x + 5 = 20?', ['5','15','25'],0,'Затем делим обе части на 3 и получаем x = 5.','После вычитания 5 остаётся 3x = 15; деление на 3 даёт 5.',['Верно: 15 / 3 = 5.','15 — значение 3x, а не x.','Нужно вычесть 5, а не прибавить.']],
      ['Какое действие первым выполняют в уравнении 2x − 4 = 10?', ['Вычитают 4 из обеих частей','Прибавляют 4 к обеим частям','Делят только левую часть на 2'],1,'прибавляем 4 к обеим частям: 2x = 14','Прибавление 4 устраняет −4 в левой части.',['Вычитание не устраняет −4.','Одинаковое действие сохраняет равенство.','Делить нужно обе части равенства.']],
    ],
    open:['Решите 2x − 4 = 10 и проверьте ответ подстановкой.','1 балл: x = 7 с правильными преобразованиями. 1 балл: проверка 2 · 7 − 4 = 10.','2x = 14, поэтому x = 7.','Прибавляем 4, делим на 2, затем подставляем 7 в исходное уравнение.'],
  },
  {
    slug:'physics', title:'Физика · 7 класс · Равномерное движение', subject:'Физика',
    text:'При равномерном движении тело за равные промежутки времени проходит равные пути. Скорость вычисляют по формуле v = s / t, где s — путь, t — время. Путь вычисляют по формуле s = v · t. Если велосипедист проехал 120 метров за 20 секунд, его скорость равна 6 м/с. При скорости 5 м/с за 8 секунд тело проходит 40 метров. Для перевода скорости из км/ч в м/с её делят на 3,6. Поэтому 36 км/ч = 10 м/с.',
    questions:[
      ['Велосипедист проехал 120 м за 20 с. Какова скорость?', ['2400 м/с','6 м/с','100 м/с'],1,'его скорость равна 6 м/с','v = 120 / 20 = 6 м/с.',['Это произведение пути и времени, а нужна частная величина.','Верно: путь делят на время.','Разность пути и времени не является скоростью.']],
      ['Какой путь пройдёт тело за 8 с при скорости 5 м/с?', ['1,6 м','13 м','40 м'],2,'При скорости 5 м/с за 8 секунд тело проходит 40 метров.','s = 5 · 8 = 40 м.',['Для пути скорость умножают на время.','Складывать величины с разными единицами нельзя.','Верно: 5 · 8 = 40.']],
    ],
    open:['Переведите 36 км/ч в м/с. Объясните вычисление.','1 балл: деление на 3,6. 1 балл: результат 10 м/с с единицей.','Поэтому 36 км/ч = 10 м/с.','В километре 1000 м, в часе 3600 с: 36 · 1000 / 3600 = 10 м/с.'],
  },
  {
    slug:'python', title:'Python · Начальный уровень · Переменные и циклы', subject:'Информатика',
    text:'В Python оператор = присваивает значение переменной. После команды x = 3 переменная x хранит число 3. Команда print(x + 2) выводит 5. Строка — это текст в кавычках: name = "Аружан". Оператор == сравнивает два значения, а не присваивает их. Цикл for i in range(3): последовательно присваивает i значения 0, 1 и 2. Если внутри цикла с отступом написать print(i), на отдельных строках появятся 0, 1 и 2. Верхняя граница range не включается.',
    questions:[
      ['Что выведет print(x + 2), если перед этим выполнено x = 3?', ['32','5','x + 2'],1,'Команда print(x + 2) выводит 5.','x хранит число 3; складываются два числа: 3 + 2.',['32 получилось бы при склеивании строк, но здесь числа.','Верно: 3 + 2 = 5.','Вычисляется выражение, а не печатается его запись.']],
      ['Какие значения перебирает range(3)?', ['1, 2, 3','0, 1, 2, 3','0, 1, 2'],2,'последовательно присваивает i значения 0, 1 и 2','По умолчанию отсчёт начинается с 0, а верхняя граница исключена.',['Начальное значение по умолчанию — 0.','Верхняя граница 3 не включается.','Верно: 0, 1, 2.']],
    ],
    open:['Объясните разницу между = и ==. Приведите по одному примеру.','1 балл: = присваивает, например x = 3. 1 балл: == сравнивает, например x == 3.','Оператор == сравнивает два значения, а не присваивает их.','Присваивание меняет значение переменной, сравнение даёт True или False.'],
  },
];

export function createAccess(){return {email:'demo.teacher@logus.local',password:randomBytes(18).toString('base64url'),students:['Аружан','Данияр','София'].map((name,i)=>({id:`logus-demo-student-${i+1}-v1`,name,token:randomBytes(24).toString('base64url')}))};}

export function seedDemo(db,access){
  db.exec('BEGIN IMMEDIATE');
  try{
    const existing=db.prepare('SELECT hash,salt FROM teachers WHERE id=?').get(teacherId);
    if(existing&&scryptSync(access.password,existing.salt,64).toString('hex')!==existing.hash)throw Error('Демо-учитель уже существует с другим паролем. Существующий аккаунт не изменён.');
    if(!existing){const salt=randomBytes(24).toString('hex');db.prepare('INSERT INTO teachers VALUES(?,?,?,?,?)').run(teacherId,'Демо · Учитель',access.email,scryptSync(access.password,salt,64).toString('hex'),salt);}
    db.prepare('INSERT OR IGNORE INTO groups VALUES(?,?,?)').run(groupId,teacherId,'7А · Демо-класс');
    for(const s of access.students)db.prepare('INSERT OR IGNORE INTO students VALUES(?,?,?,?)').run(s.id,groupId,s.name,s.token);
    db.prepare('INSERT OR IGNORE INTO profile_preferences VALUES(?,?,?,?,?)').run('teacher',teacherId,'ru','light','Asia/Qyzylorda');
    for(const [index,subject] of subjects.entries()){
      const lessonId=`logus-demo-${subject.slug}-v1`,runId=lessonId+'-run';
      const questionBase={skill:subject.subject,sourceId:1,maxPoints:1};
      const questions=subject.questions.map(([prompt,options,correctIndex,quote,explanation,optionExplanations],i)=>({...questionBase,id:`${lessonId}-q${i+1}`,type:'choice',prompt,options,correctIndex,criterion:'',quote,explanation,optionExplanations}));
      const [prompt,criterion,quote,explanation]=subject.open;
      questions.push({...questionBase,id:`${lessonId}-open`,type:'open',prompt,criterion,quote,explanation,options:[],correctIndex:null,maxPoints:2});
      const body=JSON.stringify({id:lessonId,title:subject.title,instruction:'Демонстрационное занятие. Прочитайте материал, ответьте на два тестовых вопроса и один открытый. Результаты появятся после проверки и публикации учителем.',pages:[{id:1,text:subject.text,documentName:subject.title,sourcePage:1}],questions,selectedPages:[1],pdfUrl:null,updatedAt:new Date().toISOString(),settings:{durationMinutes:15,opensAt:null,dueAt:null,resultMode:'teacher'}});
      db.prepare('INSERT OR IGNORE INTO lessons VALUES(?,?,?)').run(lessonId,teacherId,body);
      db.prepare('INSERT OR IGNORE INTO runs VALUES(?,?,?,?,?,?,?)').run(runId,lessonId,groupId,'lesson',null,new Date().toISOString(),body);
      for(const s of access.students)db.prepare('INSERT OR IGNORE INTO assignments(run,student) VALUES(?,?)').run(runId,s.id);
      const start=Temporal.Now.zonedDateTimeISO('Asia/Qyzylorda').add({days:index+1}).with({hour:10,minute:0,second:0,millisecond:0,microsecond:0,nanosecond:0});
      db.prepare('INSERT OR IGNORE INTO calendar_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(lessonId+'-event',teacherId,groupId,lessonId+'-series',subject.title,subject.subject,'Демо-занятие: материал и тест доступны по ссылке.',start.toInstant().toString(),start.add({minutes:45}).toInstant().toString(),'Asia/Qyzylorda',lessonId,runId,0,'{}');
    }
    db.exec('COMMIT');
    return {lessons:subjects.length,students:access.students.length};
  }catch(error){db.exec('ROLLBACK');throw error;}
}

async function main(){
  const dir=resolve(process.env.LOGUS_DEMO_ACCESS_DIR||'data');await mkdir(dir,{recursive:true});
  const accessFile=join(dir,'demo-access.json');let access;
  try{access=JSON.parse(await readFile(accessFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;access=createAccess();await writeFile(accessFile,JSON.stringify(access,null,2),{flag:'wx',mode:0o600});}
  const cloud=process.argv.includes('--cloud');
  if(cloud){
    if(!process.env.BLOB_READ_WRITE_TOKEN)throw Error('Для облака требуется BLOB_READ_WRITE_TOKEN.');
    const store=await import('@vercel/blob');const original=await store.get(databaseKey,freshRead);
    if(!original?.stream)throw Error('Не найдена существующая облачная база.');
    const backupDir=resolve('backups');await mkdir(backupDir,{recursive:true});
    await writeFile(join(backupDir,`cloud-before-demo-${Date.now()}.sqlite`),Buffer.from(await new Response(original.stream).arrayBuffer()),{flag:'wx',mode:0o600});
    await withCloudDatabase(()=>seedDemo(cloudStorage().db,access));
  }else{const {db}=connect();try{seedDemo(db,access)}finally{db.close()}}
  const base=(process.env.LOGUS_DEMO_BASE_URL||'http://localhost:3000').replace(/\/$/,'');
  const guide=['Logus · Демо-доступ',`Платформа: ${base}`,`Учитель: ${access.email}`,`Пароль: ${access.password}`,'','Ученики (открывайте в отдельном профиле браузера или приватном окне):',...access.students.map(s=>`${s.name}: ${base}/invite/${s.token}`),'','Проверка: ученик сдаёт тест → учитель проверяет открытый ответ → Группы → Занятия → Опубликовать результаты.','Демо-аккаунт даёт доступ к платным операциям ИИ после настройки API: не публикуйте пароль.'].join('\n');
  const guideFile=join(dir,cloud?'demo-access-online.txt':'demo-access-local.txt');await writeFile(guideFile,guide,{mode:0o600});
  console.log(`Готово: 3 урока, 3 ученика. Данные входа: ${guideFile}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
