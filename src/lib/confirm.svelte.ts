/** App-wide confirmation dialog (see ConfirmDialog.svelte, mounted once in App). */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Red confirm button, for destructive actions. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const confirmState = $state<{ current: Pending | null }>({ current: null });

/** Resolves true if the user confirms, false if they cancel or press Esc. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  confirmState.current?.resolve(false);
  return new Promise((resolve) => {
    confirmState.current = { ...options, resolve };
  });
}
