import {legacyMessages} from './legacy-messages';
import {calendarMessages} from './calendar-messages';
import {authoringMessages,authoringLegacy} from './authoring-messages';
import {testMessages} from './test-messages';
export const messages:Record<string,Record<string,string>>=Object.fromEntries(['ru','kk','en'].map(language=>[language,{...legacyMessages[language],...calendarMessages[language as 'ru'],...authoringMessages[language as 'ru'],...authoringLegacy[language as 'ru'],...testMessages[language as 'ru']}]))
