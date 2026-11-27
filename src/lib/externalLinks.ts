import type { MouseEvent } from 'react';

export function openExternalLink(event: MouseEvent<HTMLAnchorElement>) {
  if (!event.defaultPrevented && window.runtime?.BrowserOpenURL) {
    event.preventDefault();
    window.runtime.BrowserOpenURL(event.currentTarget.href);
  }
}
