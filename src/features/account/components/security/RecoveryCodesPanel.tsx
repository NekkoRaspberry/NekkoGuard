import { Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import styles from './Security.module.css';

/** Displays freshly generated recovery codes once, with copy / download. */
export function RecoveryCodesPanel({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. plain HTTP on a LAN address) — download still works.
    }
  }

  function download() {
    const blob = new Blob([`NekkoGuard recovery codes\nEach code can be used once.\n\n${text}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'nekkoguard-recovery-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.codesPanel}>
      <Banner tone="warning" title="Save these codes now">
        They will not be shown again. Each code signs you in once if you lose your authenticator.
      </Banner>
      <ol className={styles.codes} aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className={styles.codesActions}>
        <Button size="sm" variant="secondary" onClick={() => void copy()} leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" variant="secondary" onClick={download} leftIcon={<Download size={14} />}>
          Download .txt
        </Button>
      </div>
    </div>
  );
}
