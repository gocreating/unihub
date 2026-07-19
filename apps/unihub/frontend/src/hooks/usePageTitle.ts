import { useEffect } from 'react';

const APP_TITLE = 'Unihub';

/**
 * Browser tab title (FR-035): sets `document.title` to `<title> · Unihub`
 * while the calling page is mounted and restores the app default on unmount.
 * Pass `undefined` while the page's subject is still loading — the app
 * default shows until the real title arrives.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);
}
