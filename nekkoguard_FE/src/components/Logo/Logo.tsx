import { useState } from 'react';
import styles from './Logo.module.css';

interface LogoProps {
  /** Show the "NekkoGuard" wordmark next to the mark. */
  withWordmark?: boolean;
  size?: number;
  /** Extra word after the wordmark, e.g. "Administration". */
  suffix?: string;
  /** White-label logo image (replaces the mark; falls back to it if it fails to load). */
  imageSrc?: string | null;
  /** White-label title (replaces the "NekkoGuard" wordmark). */
  title?: string | null;
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={styles.mark}>
      <rect width="32" height="32" rx="8" fill="var(--surface-2)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="var(--border-default)" />
      <path
        d="M16 5.5 7 9v6.4c0 5.6 3.8 9.6 9 11.1 5.2-1.5 9-5.5 9-11.1V9l-9-3.5Z"
        fill="var(--primary-subtle)"
        stroke="var(--primary)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m11.5 12.5 1.6 3.2M20.5 12.5l-1.6 3.2" stroke="var(--text-primary)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 19c.9.8 1.9 1.2 3 1.2s2.1-.4 3-1.2" stroke="var(--text-primary)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ withWordmark = true, size = 32, suffix, imageSrc, title }: LogoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(imageSrc) && failedSrc !== imageSrc;

  return (
    <span className={styles.logo}>
      {showImage ? (
        <img
          src={imageSrc ?? undefined}
          alt=""
          className={styles.image}
          style={{ height: size, maxWidth: withWordmark ? size * 5 : size }}
          onError={() => setFailedSrc(imageSrc ?? null)}
        />
      ) : (
        <LogoMark size={size} />
      )}
      {withWordmark && (
        <span className={styles.wordmark}>
          {title ? (
            <span className={styles.customTitle}>{title}</span>
          ) : (
            <>
              Nekko<span className={styles.accent}>Guard</span>
            </>
          )}
          {suffix && <span className={styles.suffix}> {suffix}</span>}
        </span>
      )}
    </span>
  );
}
