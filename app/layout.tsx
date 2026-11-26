import './global.css';
import './theme.css';
import './design.css';
import {I18nProvider} from './I18n';
export const metadata={title:'Logus · Learning workspace',description:'Materials, tests and classroom progress',icons:{icon:'/logo.svg'}};
const boot=`try{var p=JSON.parse(localStorage.getItem('logus-preferences')||'{}');document.documentElement.dataset.theme=p.theme==='dark'||(p.themeV===2&&p.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';document.documentElement.lang=p.language||'ru'}catch(e){}`;
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:boot}}/></head><body><I18nProvider>{children}</I18nProvider></body></html>}
