import { profileDispatch } from "../../../lib/profile";
import { createDemoTeacher } from "../../../lib/demo-teacher";
import { calendarDispatch } from "../../../lib/calendar";
import { retrieveContext } from "../../../lib/rag";
import { defaultTestSettings, publishResults, settings, settleExpired } from "../../../lib/test-policy";
import { readFile, writeFile } from "node:fs/promises";
import { CloudStorageError, cloudStorage, readCloudPdf, stageCloudPdf, withRequestDatabase } from "../../../lib/server-cloud.mjs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  extractPdf,
  extractDocument,
  generationOptions,
  type GenerationOptions,
  generateQuestions,
  suggestGrade,
} from "../../../lib/material";
import {
  all,
  one,
  run,
  storage,
  transaction,
  ApiError,
  fail,
  found,
  str,
  required,
  id,
  secret,
  login,
  session,
  signIn,
  cookieToken,
  baseUrl,
  groupDto,
  ownedGroup,
  ownedLesson,
  ownedRun,
  saveLesson,
  editLesson,
  questionIssues,
  selected,
  type Lesson,
  type Question,
  type Row,
} from "../../../lib/server-core";
import {
  teacherHome,
  groupReport,
  studentHome,
  studentDetails,
  studentAction,
  startMapReview,
  teacherDetails,
  grade,
  issueRun,
  joinClassRuns,
} from "../../../lib/server-report";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const pdfLimitMiB = () => process.env.VERCEL === "1" ? 4 : 20;
type Context = { params: Promise<{ path: string[] }> };
// Public practicum creates one participant per browser token; cap new participants per client address.
const practiceSignups = new Map<string, number[]>();
function limitPracticeSignups(req: Request) {
  const address = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local").split(",")[0].trim();
  const now = Date.now(), windowMs = 10 * 60000;
  const recent = (practiceSignups.get(address) || []).filter((t) => t > now - windowMs);
  if (recent.length >= 30) fail(429, "Слишком много новых попыток. Повторите через несколько минут.");
  if (practiceSignups.size > 5000) practiceSignups.clear();
  practiceSignups.set(address, [...recent, now]);
}
async function input(req: Request): Promise<Row> {
  const raw = await req.text();
  if (raw.length > 5000000) fail(413, "Слишком большой запрос.");
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(400, "Ожидается JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    fail(400, "Ожидается объект.");
  return parsed;
}
async function generate(
  l: Lesson,
  skill?: string,
  originalPrompt?: string,
  replacement?: Question,
  owner?: string,
  options?: GenerationOptions,
) {
  const source = {...l, selectedPages: replacement ? [replacement.sourceId] : l.selectedPages};
  const pages = owner ? retrieveContext(owner, source, [options?.topic,options?.focus,options?.prompt,skill].filter(Boolean).join(" ")) : selected(source);
  if (!pages.length || !pages.some((p) => p.text.trim()))
    fail(400, "Выберите страницы с текстом.");
  try {
    const otherPrompts = replacement
      ? l.questions.filter(q => q.id !== replacement.id && typeof q.prompt === "string").map(q => q.prompt)
      : [];
    const questions = await generateQuestions(
      pages, skill, originalPrompt,
      replacement ? { type: replacement.type, maxPoints: replacement.maxPoints, otherPrompts } : undefined,
      options ? {...options,owner,existingPrompts:options.existingPrompts || []} : owner ? {owner,legacy:true} : undefined,
    );
    if (replacement) {
      const candidate = questions[0];
      if (candidate.type !== replacement.type || candidate.sourceId !== replacement.sourceId)
        throw new Error("ИИ изменил тип или страницу исходного вопроса. Повторите замену.");
      const normalizePrompt = (value: string) =>
        value.normalize("NFKC").toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, "");
      const candidatePrompt = normalizePrompt(candidate.prompt);
      if ([replacement.prompt, ...otherPrompts].some(p => normalizePrompt(p) === candidatePrompt))
        throw new Error("ИИ повторил формулировку одного из вопросов. Повторите замену.");
      candidate.id = replacement.id;
      candidate.maxPoints = replacement.maxPoints;
    }
    return { questions, issues: questionIssues(questions, pages) };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    fail(
      503,
      e instanceof Error
        ? e.message
        : "Генерация недоступна. Попробуйте ещё раз или добавьте вопрос вручную.",
    );
  }
}
async function dispatch(req: Request, parts: string[]) {
  const [resource, k, action, n] = parts,
    method = req.method;
  const is = (m: string, length: number) =>
    method === m && parts.length === length;
  if (method !== "GET") {
    const origin = req.headers.get("origin");
    if (
      origin &&
      new URL(origin).host !== req.headers.get("host") &&
      origin !== new URL(req.url).origin
    )
      fail(403, "Недопустимый источник запроса.");
  }
  if (resource === "login" && is("POST", 1)) {
    const b = await input(req);
    return login(req, b.email, b.password);
  }
  if (resource === "practice" && is("POST", 1)) {
    const token = (await input(req)).token;
    if(typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) fail(400,"Неверное приглашение.");
    if(!one("SELECT id FROM runs WHERE id=?", "public-map-v1")) fail(404,"Практикум не опубликован.");
    const studentId = createHash("sha256").update("public-map-v1:"+token).digest("hex");
    const name = "Участник "+studentId.slice(0,6);
    if(!one("SELECT 1 FROM students WHERE id=?",studentId)) limitPracticeSignups(req);
    run("INSERT OR IGNORE INTO students VALUES(?,?,?,?)",studentId,"public-map-group",name,secret());
    run("INSERT OR IGNORE INTO assignments(run,student) VALUES(?,?)","public-map-v1",studentId);
    const fresh = one("SELECT status FROM assignments WHERE run=? AND student=?","public-map-v1",studentId)?.status === "not_started";
    const signed=signIn(req,"student",{id:studentId,name});
    return Response.json({id:studentId,name,fresh},{headers:signed.headers});
  }
  if (resource === "demo-teacher" && is("POST", 1)) {
    if (process.env.LOGUS_DEMO_TEACHERS === "0") fail(404, "Демо-кабинет отключён.");
    limitPracticeSignups(req);
    return signIn(req, "teacher", createDemoTeacher(baseUrl(req)));
  }
  if (resource === "join" && is("POST", 1)) {
    const b = await input(req),
      s = one("SELECT * FROM students WHERE invite=?", required(b.token, 200));
    if (!s) fail(404, "Приглашение не найдено. Уточните ссылку у учителя.");
    return signIn(req, "student", s);
  }
  if (resource === "logout" && is("POST", 1)) {
    run("DELETE FROM sessions WHERE token=?", cookieToken(req));
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie":
            "logus_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        },
      },
    );
  }
  if (resource === "me" && is("GET", 1)) return session(req);
  if (resource === "files" && is("GET", 2)) {
    const u = session(req),
      f = found(one("SELECT * FROM files WHERE id=?", k));
    if (
      u.role === "teacher"
        ? f.teacher !== u.id &&
          !one("SELECT 1 FROM file_readers WHERE file=? AND teacher=?", k, u.id)
        : !one(
            "SELECT r.id FROM assignments a JOIN runs r ON r.id=a.run WHERE a.student=? AND (json_extract(r.body,'$.pdfUrl')=? OR EXISTS (SELECT 1 FROM json_each(r.body,'$.pages') p WHERE json_extract(p.value,'$.pdfUrl')=?))",
            u.id,
            "/api/files/" + k,
            "/api/files/" + k,
          ) && !one("SELECT 1 FROM calendar_events e JOIN students s ON s.grp=e.grp JOIN lessons l ON l.id=e.lesson WHERE s.id=? AND e.cancelled=0 AND e.run IS NULL AND (json_extract(l.body,'$.pdfUrl')=? OR EXISTS(SELECT 1 FROM json_each(l.body,'$.pages') p WHERE json_extract(p.value,'$.pdfUrl')=?))",u.id,"/api/files/"+k,"/api/files/"+k)
    )
      fail(404, "Файл не найден.");
    const content = cloudStorage() ? await readCloudPdf(f.id) : new Uint8Array(await readFile(
      /* turbopackIgnore: true */ join(storage().dir, "files", f.id + ".pdf"),
    ));
    return new Response(content, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="material.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (resource === "profile" || resource === "calendar") {
    const actor=session(req);
    const response=resource==="profile"?await profileDispatch(req,parts,actor):await calendarDispatch(req,parts,actor,baseUrl(req));
    if(response) return response;
    fail(404,"Маршрут не найден.");
  }
  if (resource === "student") {
    const u = session(req, "student");
    const expectedStudent = req.headers.get("X-Logus-Student");
    if (expectedStudent !== null && expectedStudent !== u.id) fail(409, "Сменился аккаунт ученика. Обновите страницу.");
    if (k === "public-map-v1" && action === "review" && is("POST", 3)) return startMapReview(u.id);
    if (is("GET", 1)) {
      run(
        "INSERT OR IGNORE INTO cabinet_visits SELECT run,student FROM assignments WHERE student=? AND status='not_started'",
        u.id,
      );
      return studentHome(u.id, u.name);
    }
    if (is("GET", 2)) {
      const detail = studentDetails(u.id, k);
      run("INSERT OR IGNORE INTO opened_lessons VALUES(?,?)", k, u.id);
      return detail;
    }
    if (
      parts.length === 3 &&
      ((method === "POST" && ["submit", "start"].includes(action)) ||
        (method === "PATCH" && action === "answers"))
    )
      return studentAction(u.id, k, action, await input(req));
    fail(404, "Маршрут не найден.");
  }
  const u = session(req, "teacher"),
    base = baseUrl(req);
  if (resource === "teacher" && is("GET", 1)) return { ...teacherHome(u.id, base), pdfLimitMiB: pdfLimitMiB() };
  if (resource === "groups") {
    if (is("POST", 1)) {
      const data = await input(req),
        key = id();
      run(
        "INSERT INTO groups VALUES(?,?,?)",
        key,
        u.id,
        required(data.name, 180),
      );
      return groupDto(ownedGroup(u.id, key), base);
    }
    const group = ownedGroup(u.id, k || "");
    if (is("GET", 2)) return groupReport(group, base, u.id);
    if (method === "POST" && group.teacher !== u.id)
      fail(403, "Составом управляет создатель класса.");
    if (action === "staff" && is("POST", 3)) {
      const data = await input(req);
      const colleague = found(
        one(
          "SELECT id FROM teachers WHERE email=?",
          required(data.email, 320).toLowerCase(),
        ),
      );
      if (colleague.id === u.id) fail(400, "Вы уже управляете классом.");
      run(
        "INSERT INTO subject_teachers VALUES(?,?,?) ON CONFLICT(grp,teacher) DO UPDATE SET subject=excluded.subject",
        k,
        colleague.id,
        required(data.subject, 120),
      );
      return { ok: true };
    }
    if (action === "import" && is("POST", 3)) {
      const { names } = await input(req);
      if (!Array.isArray(names) || !names.length || names.length > 500)
        fail(400, "Вставьте от 1 до 500 имён.");
      const cleaned = names.map((v) => required(v, 120));
      return transaction(() => {
        const key = (s: string) =>
          s
            .normalize("NFKC")
            .toLocaleLowerCase("ru")
            .replace(/\s+/g, " ")
            .trim();
        const existing = new Set(
          all("SELECT name FROM students WHERE grp=?", k).map((s) =>
            key(s.name),
          ),
        );
        let added = 0;
        for (const name of cleaned) {
          if (existing.has(key(name))) continue;
          const sid = id();
          run("INSERT INTO students VALUES(?,?,?,?)", sid, k, name, secret());
          joinClassRuns(sid);
          existing.add(key(name));
          added++;
        }
        return { added, skipped: cleaned.length - added };
      });
    }
    if (action === "renew" && is("POST", 4)) {
      return transaction(() => {
        const s = found(
          one("SELECT name FROM students WHERE id=? AND grp=?", n, k),
        );
        const token = secret();
        run("UPDATE students SET invite=? WHERE id=?", token, n);
        run("DELETE FROM sessions WHERE role='student' AND user=?", n);
        return { id: n, name: s.name, inviteUrl: base + "/invite/" + token };
      });
    }
    if (action === "students") {
      if (is("POST", 3)) {
        const data = await input(req);
        const sid = id();
        transaction(() => {
          run(
            "INSERT INTO students VALUES(?,?,?,?)",
            sid,
            k,
            required(data.name, 120),
            secret(),
          );
          joinClassRuns(sid);
        });
        return groupDto(group, base);
      }
      if (is("GET", 4)) {
        const s = found(
            one("SELECT name FROM students WHERE id=? AND grp=?", n, k),
          ),
          home = studentHome(n, s.name, u.id);
        return { name: s.name, works: home.items, skills: home.skills };
      }
    }
  }
  if (resource === "lessons") {
    if (is("POST", 1)) {
      const data = await input(req);
      const l: Lesson = {
        id: id(),
        title: "Новый урок",
        instruction: "",
        pdfUrl: null,
        pages: [],
        questions: [],
        selectedPages: [],
        updatedAt: "",
        settings: { ...defaultTestSettings },
      };
      return saveLesson(editLesson(l, data), u.id);
    }
    let l = ownedLesson(u.id, k || "");
    if (is("GET", 2)) return l;
    if (is("DELETE",2)) {
      if(one("SELECT 1 FROM runs WHERE lesson=?",k)) fail(409,"Урок уже проводился. Архивируйте проведения, чтобы сохранить историю.");
      if(one("SELECT 1 FROM calendar_events WHERE lesson=?",k)) fail(409,"Урок связан с расписанием. Сначала удалите привязку материала в событиях.");
      transaction(()=>{
        run("DELETE FROM material_chunks WHERE owner=? AND lesson=?",u.id,k);
        run("DELETE FROM lessons WHERE id=? AND teacher=?",k,u.id);
      });
      return {ok:true};
    }
    if (is("PATCH", 2)) {
      const data = await input(req);
      return saveLesson(editLesson(ownedLesson(u.id, k), data), u.id);
    }
    if (action === "share" && is("POST", 3)) {
      const { email, groupId } = await input(req);
      const group = ownedGroup(u.id, required(groupId));
      const recipient = found(
        one(
          "SELECT id FROM teachers WHERE email=?",
          required(email, 320).toLowerCase(),
        ),
      );
      if (
        recipient.id === u.id ||
        (group.teacher !== recipient.id &&
          !one(
            "SELECT 1 FROM subject_teachers WHERE grp=? AND teacher=?",
            group.id,
            recipient.id,
          ))
      )
        fail(400, "Выберите коллегу, который ведёт этот класс.");
      return transaction(() => {
        for (const pdf of new Set([l.pdfUrl,...l.pages.map(p=>p.pdfUrl)].filter(Boolean)))
          run(
            "INSERT OR IGNORE INTO file_readers VALUES(?,?)",
            pdf!.split("/").pop()!,
            recipient.id,
          );
        return saveLesson(
          { ...l, id: id(), title: l.title + " (копия)" },
          recipient.id,
        );
      });
    }
    if (action === "search" && is("POST",3)) {
      const data=await input(req), query=str(data.query||"",2000);
      return {fragments:retrieveContext(u.id,l,query).map(fragment=>({...l.pages.find(p=>p.id===fragment.id),...fragment}))};
    }
    if (action === "generate" && is("POST", 3)) {
      const data = await input(req);
      let options:GenerationOptions|undefined;
      if (data.options || "count" in data) {
        try { options = generationOptions(data.options || data); } catch(e) { fail(400,(e as Error).message); }
      }
      if (options && data.mode === "append") options.existingPrompts=l.questions.map(q=>q.prompt);
      if (!("replaceQuestionId" in data)) return generate(l,undefined,undefined,undefined,u.id,options);
      const questionId = required(data.replaceQuestionId);
      const target = found(l.questions.find(q => q.id === questionId));
      if (!target.prompt?.trim() || !target.skill?.trim())
        fail(400, "Укажите исходную формулировку и навык для замены.");
      return generate(l, target.skill, target.prompt, target,u.id,options);
    }
    if (action === "publish" && is("POST", 3)) {
      const data = await input(req);
      return issueRun(
        ownedLesson(u.id, k),
        ownedGroup(u.id, required(data.groupId)),
        base,
      );
    }
    if (["pdf","materials"].includes(action) && is("POST",3)) {
      const limit=pdfLimitMiB()*1024*1024;
      if(Number(req.headers.get("content-length"))>limit+65536) fail(413,"Превышен размер загрузки.");
      const form=await req.formData();
      const uploads=[...form.getAll("file"),...form.getAll("files")];
      if(!uploads.length || uploads.length>10 || uploads.some(f=>typeof f==="string")) fail(400,"Выберите от 1 до 10 файлов.");
      const files=uploads as File[];
      if(files.reduce((n,f)=>n+f.size,0)>limit) fail(413,"Превышен размер загрузки.");
      const processed: {name:string;bytes:Buffer;texts:string[];pdf:boolean;id:string}[]=[];
      for(const file of files) {
        const bytes=Buffer.from(await file.arrayBuffer());
        if(/\.pdf$/i.test(file.name) && !bytes.subarray(0,1024).includes(Buffer.from("%PDF-"))) fail(400,"Не удалось распознать PDF.");
        let texts:string[]=[];
        try { texts=await extractDocument(bytes,file.name); }
        catch(error) {
          if(!/\.pdf$/i.test(file.name)) fail(400,(error as Error).message);
        }
        if(texts.join("").length>2000000) fail(413,"Разделите материал на несколько уроков.");
        processed.push({name:file.name,bytes,texts,pdf:/\.pdf$/i.test(file.name),id:id()});
      }
      l=ownedLesson(u.id,k);
      const append=action==="materials" || form.get("append")==="true";
      const pages=append?[...l.pages]:[];
      if(pages.reduce((n,p)=>n+p.text.length,0)+processed.reduce((n,f)=>n+f.texts.join("").length,0)>4000000) fail(413,"Разделите материал на несколько уроков.");
      const grants:string[]=[];
      for(const file of processed) {
        const pdfUrl=file.pdf?"/api/files/"+file.id:null;
        if(file.pdf) {
          if(cloudStorage()) stageCloudPdf(file.id,file.bytes);
          else await writeFile(/* turbopackIgnore: true */ join(storage().dir,"files",file.id+".pdf"),file.bytes,{flag:"wx"});
          grants.push(file.id);
        }
        const offset=pages.reduce((m,p)=>Math.max(m,p.id),0);
        (file.texts.length?file.texts:[""]).forEach((text,i)=>pages.push({id:offset+i+1,text,documentId:file.id,documentName:file.name,sourcePage:i+1,pdfUrl}));
      }
      return transaction(()=>{
        for(const key of grants) run("INSERT INTO files VALUES(?,?)",key,u.id);
        l.pages=pages;l.selectedPages=pages.filter(p=>p.text.trim()).map(p=>p.id);
        l.pdfUrl=pages.find(p=>p.pdfUrl)?.pdfUrl || null;
        if(!append) l.questions=[];
        return {...saveLesson(l,u.id),...(processed.some(f=>!f.texts.some(t=>t.trim()))?{warning:"Текст не извлечён. Для скана требуется OCR. Вставьте текст материала вручную."}:{})};
      });
    }
  }

  if (resource === "runs" && is("POST",3) && ["results","archive"].includes(action)) {
    ownedRun(u.id,k);
    if(action==="results") return publishResults(k);
    run("INSERT OR IGNORE INTO run_archive VALUES(?,?)",k,Date.now());
    return {ok:true};
  }
  if (resource === "runs" && is("GET", 3) && action === "classroom") {
    const r = ownedRun(u.id, k),
      lesson: Lesson = JSON.parse(r.body);
    settleExpired(undefined,k);
    const rows = all(
      "SELECT a.student AS id,s.name,a.status,a.answers,a.points,o.run IS NOT NULL AS opened,v.run IS NOT NULL AS entered FROM assignments a JOIN students s ON s.id=a.student LEFT JOIN opened_lessons o ON o.run=a.run AND o.student=a.student LEFT JOIN cabinet_visits v ON v.run=a.run AND v.student=a.student WHERE a.run=? ORDER BY s.name,s.id",
      k,
    );
    const maxPoints = lesson.questions.reduce((a, q) => a + (q.maxPoints || 0), 0);
    return {
      questions: lesson.questions.filter((q) => q.type === "open"),
      totalQuestions: lesson.questions.length,
      maxPoints,
      students: rows.map((row) => ({
        ...row,
        answered: (() => {
          try {
            return Object.values(JSON.parse(row.answers || "{}")).filter(
              (v) => v !== null && v !== undefined && String(v).trim() !== "",
            ).length;
          } catch {
            return 0;
          }
        })(),
        score: (() => {
          try {
            return Object.values(JSON.parse(row.points || "{}")).reduce(
              (a: number, v) => a + (Number(v) || 0),
              0,
            );
          } catch {
            return 0;
          }
        })(),
        answers:
          row.status === "pending" || row.status === "graded"
            ? JSON.parse(row.answers)
            : {},
        points: JSON.parse(row.points),
      })),
    };
  }
  if (resource === "works" && action) {
    const detail = teacherDetails(u.id, k, action);
    if (is("GET", 3)) return detail;
    if (n === "mark" && is("POST", 4)) {
      const data = await input(req);
      return transaction(() => {
        const d = teacherDetails(u.id, k, action);
        const q = found(
          d.questions.find(
            (q) => q.id === data.questionId && q.type === "open",
          ),
        );
        if (d.work.status !== "pending" || Object.hasOwn(d.points, q.id))
          fail(409, "Этот ответ уже проверен. Обновите список.");
        if (
          typeof data.points !== "number" ||
          !Number.isFinite(data.points) ||
          data.points < 0 ||
          data.points > q.maxPoints
        )
          fail(400, "Проверьте количество баллов.");
        const note = str(data.comment || "", 2000);
        const points = { ...d.points, [q.id]: data.points };
        const finished = d.questions.every((q) => Object.hasOwn(points, q.id));
        const comment = [d.work.comment, note && q.prompt + " — " + note]
          .filter(Boolean)
          .join("\n");
        run(
          "UPDATE assignments SET points=?,comment=?,status=? WHERE run=? AND student=?",
          JSON.stringify(points),
          comment,
          finished ? "graded" : "pending",
          k,
          action,
        );
        return { finished };
      });
    }
    if (n === "grade" && is("POST", 4))
      return grade(k, action, await input(req));
    if (n === "suggest" && is("POST", 4)) {
      if (!["pending", "graded"].includes(detail.work.status))
        fail(409, "Работа ещё не сдана.");
      const data = await input(req),
        q = found(
          detail.questions.find(
            (q) => q.id === data.questionId && q.type === "open",
          ),
        );
      try {
        return await suggestGrade(q, String(detail.answers[q.id] || ""),u.id);
      } catch (e) {
        fail(
          503,
          e instanceof Error
            ? e.message
            : "Подсказка недоступна. Выставьте балл вручную.",
        );
      }
    }
  }
  if (
    resource === "runs" &&
    is("POST", 3) &&
    ["warmup-preview", "warmup"].includes(action)
  ) {
    const r = ownedRun(u.id, k),
      l: Lesson = JSON.parse(r.body),
      data = await input(req);
    const q = found(l.questions.find((q) => q.id === data.questionId));
    l.pages = l.pages.filter((p) => p.id === q.sourceId);
    l.selectedPages = l.pages.map((p) => p.id);
    if (action === "warmup-preview") return generate(l, q.skill, q.prompt,undefined,u.id);
    if (
      !Array.isArray(data.questions) ||
      data.questions.length < 1 ||
      data.questions.length > 2 ||
      data.questions.some((v: Question) => !v || v.skill !== q.skill)
    )
      fail(400, "Добавьте одно или два задания на выбранный навык.");
    l.title = data.title ? required(data.title, 240) : "Разминка · " + q.skill;
    l.instruction = "Повторите материал и выполните короткую разминку.";
    l.questions = data.questions;
    l.settings = {...settings(l),durationMinutes:null,opensAt:null,dueAt:null};
    return issueRun(
      l,
      ownedGroup(u.id, r.grp),
      base,
      "warmup",
      k,
      data.studentIds,
    );
  }
  fail(404, "Маршрут не найден.");
}
async function handle(req: Request, ctx: Context) {
  try {
    const parts = (await ctx.params).path;
    const result = await withRequestDatabase(() => dispatch(req, parts));
    return result instanceof Response
      ? result
      : Response.json(result, {
          headers: { "Cache-Control": "private, no-store" },
        });
  } catch (e) {
    if (!(e instanceof ApiError) && !(e instanceof CloudStorageError))
      console.error(
        "Logus API",
        e instanceof Error ? e.name + ": " + e.message : "unexpected error",
      );
    return Response.json(
      {
        error:
          (e instanceof ApiError || e instanceof CloudStorageError)
            ? e.message
            : "Не удалось выполнить действие. Попробуйте ещё раз.",
      },
      {
        status: (e instanceof ApiError || e instanceof CloudStorageError) ? e.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
