/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` only exists in secure contexts (HTTPS or localhost). NekkoGuard is
 * often opened over plain HTTP on the LAN (http://<PI_IP>:8080), so fall back to the
 * legacy `execCommand('copy')` with a temporary off-screen textarea.
 *
 * Returns true when the text was copied.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // permission denied etc. — try the fallback below
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  // Inside a modal, Radix traps focus within the dialog: append next to the active element.
  const host = document.activeElement?.closest('[role="dialog"]') ?? document.body;
  host.appendChild(textarea);
  const previousFocus = document.activeElement as HTMLElement | null;
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let copied: boolean;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    host.removeChild(textarea);
    previousFocus?.focus();
  }
  return copied;
}
