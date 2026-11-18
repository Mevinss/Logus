"use client";
import {useI18n} from './I18n';
export default function Atlas(){const {t}=useI18n();return <ol className="learning-path">{['material','test','schedule','progress'].map((key,i)=><li key={key}><span className="path-index">0{i+1}</span><div><strong>{t('path.'+key)}</strong><p>{t('path.'+key+'Hint')}</p></div><span aria-hidden="true">↗</span></li>)}</ol>}
