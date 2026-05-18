import { createContext, useContext, useState, type ReactNode } from 'react';

export type LocaleKey = 'en-US' | 'zh-TW';

interface LocaleContextValue {
  locale: LocaleKey;
  setLocale: (locale: LocaleKey) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en-US',
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleKey>(
    () => (localStorage.getItem('unihub-locale') as LocaleKey) ?? 'en-US',
  );

  const setLocale = (l: LocaleKey) => {
    localStorage.setItem('unihub-locale', l);
    setLocaleState(l);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  return useContext(LocaleContext);
}
