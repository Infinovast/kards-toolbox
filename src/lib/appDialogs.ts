export interface ConfirmationOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface AppDialogRequest {
  id: number;
  kind: 'confirmation' | 'notice' | 'copy';
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  text?: string;
  returnFocus: HTMLElement | null;
}

interface PendingDialog {
  request: AppDialogRequest;
  resolve: (accepted: boolean) => void;
}

let nextId = 0;
const pending: PendingDialog[] = [];
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(listener => listener());
export const subscribeAppDialogs = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getAppDialogSnapshot = () => pending[0]?.request || null;

function requestDialog(request: Omit<AppDialogRequest, 'id' | 'returnFocus'>): Promise<boolean> {
  return new Promise(resolve => {
    const returnFocus = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pending.push({ request: { ...request, id: ++nextId, returnFocus }, resolve });
    publish();
  });
}

export function resolveAppDialog(id: number, accepted: boolean) {
  if (pending[0]?.request.id !== id) return;
  const current = pending.shift()!;
  publish();
  current.resolve(accepted);
}

export function requestConfirmation(message: string, options: ConfirmationOptions = {}): Promise<boolean> {
  return requestDialog({ kind: 'confirmation', message, title: options.title || '确认操作', confirmLabel: options.confirmLabel || '确认', cancelLabel: options.cancelLabel || '取消' });
}

export async function requestNotice(message: string, options: Pick<ConfirmationOptions, 'title' | 'confirmLabel'> = {}): Promise<void> {
  await requestDialog({ kind: 'notice', message, title: options.title || '提示', confirmLabel: options.confirmLabel || '知道了' });
}

export async function requestCopyText(message: string, text: string): Promise<void> {
  await requestDialog({ kind: 'copy', message, text, title: '手动复制卡组码', confirmLabel: '完成' });
}
