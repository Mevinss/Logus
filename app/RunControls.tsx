"use client";
import { useState } from "react";
import { useI18n } from "./I18n";
import { api, type AnyRow } from "./teacher-ui";
export default function RunControls({run,refresh}:{run:AnyRow;refresh:()=>void}) {
  const {t}=useI18n();
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function act(action:string){
    setBusy(true);setMessage("");
    try{const response=await api(`/api/runs/${run.id}/${action}`,"POST",{});
      setMessage(action==="results"?t("test.publishDone",{count:response.published}):t("test.archived"));refresh();
    }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
  }
  return <div className="t-stack">
    {run.settings?.resultMode==="teacher"?<>
      <p>{t("test.published",{count:run.published})} · {t("test.publishHelp")}</p>
      <button className="t-primary" disabled={busy||run.pending>0||run.submitted===0} onClick={()=>act("results")}>{t("test.publish")}</button>
    </>:<p>{t("test.immediate")}</p>}
    {run.archived?<p>{t("test.archived")}</p>:<button className="t-btn" disabled={busy} onClick={()=>{if(confirm(t("test.archiving")))void act("archive")}}>{t("test.archive")}</button>}
    {!!run.expired&&<p>{t("test.expiredCount",{count:run.expired})}</p>}
    {run.averagePercent!==null&&run.averagePercent!==undefined&&<p>{t("test.average",{percent:run.averagePercent,count:run.gradedCount})}</p>}
    {run.distribution?.length>0&&<details><summary>{t("test.distribution")}</summary>{run.distribution.map((band:AnyRow)=><p key={band.from}>{t("test.band",band)}</p>)}</details>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
