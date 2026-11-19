import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getAppDialogSnapshot, resolveAppDialog, subscribeAppDialogs, type AppDialogRequest } from '../lib/appDialogs';
import { handleDialogKeys } from '../lib/dialogKeyboard';

function AppDialog({ request }: { request: AppDialogRequest }) {
  const panel = useRef<HTMLElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const close = (accepted = false) => resolveAppDialog(request.id, accepted);
  useEffect(() => {
    if (request.kind === 'copy') { text.current?.focus(); text.current?.select(); }
    else panel.current?.querySelector<HTMLButtonElement>('[data-dialog-confirm]')?.focus();
    return () => { if (request.returnFocus?.isConnected && !request.returnFocus.matches(':disabled')) request.returnFocus.focus(); };
  }, [request]);
  const titleId = `app-dialog-title-${request.id}`;
  const messageId = `app-dialog-message-${request.id}`;
  return <div className="fixed inset-0 z-[11000] flex items-center justify-center p-5">
    <div className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm" onClick={() => close()} />
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} tabIndex={-1} onKeyDown={handleDialogKeys}
      className="glass-panel relative flex max-h-[calc(100dvh-40px)] w-full max-w-md flex-col rounded-lg border border-kards-border p-6 text-kards-text shadow-2xl">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-bold">{request.title}</h2>
        <button type="button" data-dialog-cancel aria-label={request.kind === 'confirmation' ? '取消确认' : '关闭提示'} onClick={() => close()} className="rounded p-1 text-kards-text-muted hover:text-kards-text"><X className="h-5 w-5" /></button>
      </div>
      <div className="custom-scrollbar min-h-0 overflow-y-auto">
        <p id={messageId} className="whitespace-pre-wrap break-words text-sm leading-7">{request.message}</p>
        {request.kind === 'copy' && <textarea ref={text} aria-label="手动复制卡组码" readOnly value={request.text || ''} rows={4}
          onFocus={event => event.currentTarget.select()}
          className="mt-4 w-full resize-none rounded border border-kards-input-border bg-kards-input-bg p-3 font-mono text-sm text-kards-text outline-none focus:border-kards-gold" />}
      </div>
      <div className="mt-6 flex shrink-0 justify-end gap-3">
        {request.cancelLabel && <button type="button" onClick={() => close()} className="rounded border border-kards-border px-5 py-2 text-sm hover:border-kards-gold">{request.cancelLabel}</button>}
        <button type="button" data-dialog-confirm onClick={() => close(true)} className="rounded bg-kards-accent px-5 py-2 text-sm font-bold text-white hover:brightness-110">{request.confirmLabel}</button>
      </div>
    </section>
  </div>;
}

export default function AppDialogHost() {
  const request = useSyncExternalStore(subscribeAppDialogs, getAppDialogSnapshot, () => null);
  return request ? createPortal(<AppDialog key={request.id} request={request} />, document.body) : null;
}
