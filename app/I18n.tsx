"use client";
import React,{createContext,useContext,useEffect,useState,useCallback} from 'react';
import {messages} from './messages';
export type Language='ru'|'kk'|'en';
export type Preferences={language:Language;theme:'light'|'dark'|'system';timeZone:string};
const defaults:Preferences={language:'ru',theme:'light',timeZone:'Asia/Qyzylorda'};
let currentLanguage:Language='ru';
let currentTimeZone='Asia/Qyzylorda';
export function formatDate(value:string|number|Date,withTime=false){return new Intl.DateTimeFormat({ru:'ru-RU',kk:'kk-KZ',en:'en-GB'}[currentLanguage],{dateStyle:'medium',...(withTime?{timeStyle:'short' as const}:{}),timeZone:currentTimeZone}).format(new Date(value));}
export function translate(key:string,language:Language=currentLanguage,params:Record<string,string|number>={}){
 const value=messages[language]?.[key]||messages.ru[key]||key;
 return value.replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??`{${name}}`));
}
const Context=createContext({...defaults,locale:'ru-RU',t:(key:string,params?:Record<string,string|number>)=>translate(key,'ru',params),setPreferences:(_p:Partial<Preferences>)=>{}});
export function I18nProvider({children}:{children:React.ReactNode}){
 const [prefs,setPrefs]=useState(defaults);
 const setPreferences=useCallback((p:Partial<Preferences>)=>setPrefs(old=>({...old,...p})),[]);
 useEffect(()=>{try{const p=JSON.parse(localStorage.getItem('logus-preferences')||'{}');let zone=defaults.timeZone;try{new Intl.DateTimeFormat('en',{timeZone:p.timeZone}).format();if(p.timeZone)zone=p.timeZone;}catch{}setPrefs({...defaults,...p,timeZone:zone,theme:p.themeV===2&&['light','dark','system'].includes(p.theme)?p.theme:p.theme==='dark'?'dark':'light',language:['ru','kk','en'].includes(p.language)?p.language:'ru'});}catch{}},[]);
 useEffect(()=>{currentLanguage=prefs.language;try{localStorage.setItem('logus-preferences',JSON.stringify({...prefs,themeV:2}));}catch{}document.documentElement.lang=prefs.language;const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>document.documentElement.dataset.theme=prefs.theme==='system'?(media.matches?'dark':'light'):prefs.theme;apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[prefs]);
 currentLanguage=prefs.language;currentTimeZone=prefs.timeZone;
 const t=useCallback((key:string,params?:Record<string,string|number>)=>translate(key,prefs.language,params),[prefs.language]);
 return <Context.Provider value={{...prefs,locale:{ru:'ru-RU',kk:'kk-KZ',en:'en-GB'}[prefs.language],t,setPreferences}}>{children}</Context.Provider>;
}
export const useI18n=()=>useContext(Context);
