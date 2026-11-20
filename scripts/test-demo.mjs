import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {connect} from '../lib/server-schema.mjs';
import {createAccess,seedDemo} from './demo-class.mjs';

test('demo seed creates assigned source-backed lessons and preserves attempts on rerun',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'logus-demo-test-'));process.env.LOGUS_DATA_DIR=dir;
 const {db}=connect();
 try{
  const access=createAccess();assert.deepEqual(seedDemo(db,access),{lessons:3,students:3});
  assert.equal(db.prepare('SELECT count(*) n FROM assignments').get().n,9);
  assert.equal(db.prepare('SELECT count(*) n FROM calendar_events').get().n,3);
  for(const row of db.prepare('SELECT body FROM lessons').all()){
   const lesson=JSON.parse(row.body);assert.equal(lesson.questions.length,3);
   for(const q of lesson.questions){assert.ok(lesson.pages[0].text.includes(q.quote));assert.ok(q.explanation);if(q.type==='choice'){assert.equal(q.optionExplanations.length,q.options.length);assert.ok(q.correctIndex>=0&&q.correctIndex<q.options.length);}}
  }
  db.prepare("UPDATE assignments SET answers='{}',status='graded',points='{}' WHERE student=?").run(access.students[0].id);
  seedDemo(db,access);
  assert.equal(db.prepare('SELECT count(*) n FROM teachers').get().n,1);
  assert.equal(db.prepare('SELECT count(*) n FROM assignments').get().n,9);
  assert.equal(db.prepare("SELECT count(*) n FROM assignments WHERE status='graded'").get().n,3);
  assert.throws(()=>seedDemo(db,createAccess()),/другим паролем/);
  assert.equal(db.prepare('PRAGMA foreign_key_check').get(),undefined);
 }finally{db.close();delete process.env.LOGUS_DATA_DIR;await rm(dir,{recursive:true,force:true});}
});
