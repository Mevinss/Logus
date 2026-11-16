"use client";
import {useEffect, useState} from "react";
import Student from "../Student";
import Brand from "../Brand";

const runId = "public-map-v1";
export default function Practice() {
  const [actor,setActor] = useState<{id:string,name:string}|null>(null);
  const [error,setError] = useState("");
  useEffect(() => {
    let active = true;
    async function enter() {
      let token = localStorage.getItem("logus:practice:identity");
      if (!token) {
        token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,"0")).join("");
        localStorage.setItem("logus:practice:identity",token);
      }
      const response = await fetch("/api/practice", {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
      const user = await response.json();
      if(!response.ok) throw Error(user.error || "Не удалось открыть практикум.");
      const copy=localStorage.getItem("logus:practice:copy:"+user.id);
      if(copy && user.fresh) {
        const attempt=JSON.parse(copy);
        const restored=await fetch("/api/student/"+runId+(attempt.submitted?"/submit":"/answers"),{
          method:attempt.submitted?"POST":"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({answers:attempt.answers})
        });
        if(!restored.ok) throw Error("Не удалось восстановить ответы. Попробуйте открыть ссылку ещё раз.");
      }
      if(active)setActor(user);
    }
    enter().catch(e=>{if(active)setError(e.message)});
    return ()=>{active=false};
  },[]);
  if(actor)return <Student name={actor.name} studentId={actor.id} initialRun={runId} onLogout={async()=>{await fetch("/api/logout",{method:"POST"});location.assign("/")}}/>;
  return <main className="entry-wait"><Brand/>{error||"Открываем практикум…"}{error&&<button onClick={()=>location.reload()}>Повторить</button>}</main>;
}
