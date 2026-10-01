import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ne from './ne.json';

/**
 * Translation setup. English is complete; Nepali ('ne') is scaffolded with navigation and
 * common labels so the language can be finished without code changes.
 */
let lng = 'en';
try {
  lng = localStorage.getItem('sprasa-lang') || 'en';
} catch {
  /* storage unavailable */
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ne: { translation: ne } },
  lng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(code: 'en' | 'ne') {
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
  try {
    localStorage.setItem('sprasa-lang', code);
  } catch {
    /* storage unavailable */
  }
}

export default i18n;
