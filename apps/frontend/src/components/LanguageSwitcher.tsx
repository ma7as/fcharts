'use client';

import { useLocale } from '@/contexts/LocaleContext';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'es' : 'en')}
      title={locale === 'en' ? 'Cambiar a español' : 'Switch to English'}
      className="text-xs font-mono text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
    >
      {locale === 'en' ? 'ES' : 'EN'}
    </button>
  );
}
