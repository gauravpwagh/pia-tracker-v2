import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enCommon from './en/common.json';
import enNav from './en/nav.json';
import enProjects from './en/projects.json';
import enErrors from './en/errors.json';
import enForms from './en/forms.json';

// i18next setup. English-only at v1 — adding Hindi is creating hi/*.json
// files and registering them here. No code changes elsewhere.

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    resources: {
      en: {
        common: enCommon,
        nav: enNav,
        projects: enProjects,
        errors: enErrors,
        forms: enForms,
      },
    },
    ns: ['common', 'nav', 'projects', 'errors', 'forms'],
    defaultNS: 'common',
  });

export { i18n };
