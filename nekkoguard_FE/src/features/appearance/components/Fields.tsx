import { PanelLeft, PanelRight, PanelTop, Upload } from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import type { AppearanceAsset, ColorField, NavbarPosition } from '@/api/appearance';
import { Button } from '@/components/Button/Button';
import { LogoMark } from '@/components/Logo/Logo';
import { TextField } from '@/components/TextField/TextField';
import { cx } from '@/lib/cx';
import { useTenantName } from '@/features/tenancy/hooks';
import { IMAGE_ACCEPT, imageFileError, originLabel, type Origin } from '../draft';
import { COLOR_LABELS, DEFAULT_COLORS, normalizeColor } from '../theme';
import styles from './Appearance.module.css';

type Scope = 'tenant' | 'organization';

/** "Customized here" / "Inherited from <Tenant name>" / "Using NekkoGuard default" + reset. */
export function OriginLabel({
  origin,
  scope,
  onReset,
  resetLabel,
  disabled,
}: {
  origin: Origin;
  scope: Scope;
  onReset?: () => void;
  resetLabel: string;
  disabled?: boolean;
}) {
  const tenantName = useTenantName();
  return (
    <span className={cx(styles.origin, origin === 'here' && styles.originHere)}>
      {originLabel(scope, origin, tenantName)}
      {origin === 'here' && onReset && !disabled && (
        <>
          {' · '}
          <button type="button" className={styles.resetLink} onClick={onReset} aria-label={resetLabel}>
            Reset
          </button>
        </>
      )}
    </span>
  );
}

interface ColorRowProps {
  field: ColorField;
  own: string | null;
  inherited: string | null;
  scope: Scope;
  disabled: boolean;
  onChange: (value: string | null) => void;
}

export function ColorRow({ field, own, inherited, scope, disabled, onChange }: ColorRowProps) {
  const label = COLOR_LABELS[field];
  const shown = own ?? inherited ?? DEFAULT_COLORS[field];
  // Free typing: the draft only changes once the text is a valid color.
  const [text, setText] = useState(shown);
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    setText(shown);
  }
  const invalid = normalizeColor(text) === null;
  const origin: Origin = own !== null ? 'here' : inherited !== null ? 'tenant' : 'default';

  const typed = (event: ChangeEvent<HTMLInputElement>) => {
    setText(event.target.value);
    const color = normalizeColor(event.target.value);
    if (color && color !== shown) onChange(color);
  };

  return (
    <div className={styles.colorRow}>
      <input
        type="color"
        className={styles.swatch}
        value={shown}
        disabled={disabled}
        aria-label={`${label} color picker`}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
      />
      <TextField
        label={label}
        value={text}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        onChange={typed}
        onBlur={() => invalid || setText(normalizeColor(text) ?? shown)}
        error={invalid ? 'Use #rrggbb, #rgb or rgb(r, g, b).' : null}
        hint={<OriginLabel origin={origin} scope={scope} onReset={() => onChange(null)} resetLabel={`Reset ${label}`} disabled={disabled} />}
      />
    </div>
  );
}

const POSITIONS: { value: NavbarPosition; label: string; icon: typeof PanelLeft }[] = [
  { value: 'left', label: 'Left', icon: PanelLeft },
  { value: 'top', label: 'Top', icon: PanelTop },
  { value: 'right', label: 'Right', icon: PanelRight },
];

export function NavPositionField({
  value,
  origin,
  scope,
  disabled,
  onChange,
}: {
  value: NavbarPosition;
  origin: Origin;
  scope: Scope;
  disabled: boolean;
  onChange: (value: NavbarPosition | null) => void;
}) {
  const name = useId();
  return (
    <div className={styles.fields}>
      <fieldset className={styles.positions} disabled={disabled}>
        <legend className="visually-hidden">Navigation position</legend>
        {POSITIONS.map(({ value: option, label, icon: Icon }) => (
          <label key={option} className={styles.position}>
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <Icon size={20} aria-hidden="true" />
            {label}
            {option === 'left' && <span className={styles.origin}>default</span>}
          </label>
        ))}
      </fieldset>
      <OriginLabel origin={origin} scope={scope} onReset={() => onChange(null)} resetLabel="Reset navigation position" disabled={disabled} />
    </div>
  );
}

interface AssetRowProps {
  asset: AppearanceAsset;
  url: string | null;
  origin: Origin;
  scope: Scope;
  disabled: boolean;
  /** Something can be removed: an own image or a pending upload. */
  removable: boolean;
  /** Theme of the scope being edited (CSS variables), so the preview box ignores the page's theme. */
  themeStyle?: CSSProperties;
  onPick: (file: File, preview: string) => void;
  onRemove: () => void;
}

const ASSET_TEXT: Record<AppearanceAsset, { title: string; help: string }> = {
  logo: { title: 'Logo', help: 'Shown in the navigation. PNG, JPEG or WebP, up to 1 MB; resized to at most 512 px.' },
  favicon: { title: 'Browser tab icon', help: 'PNG, JPEG or WebP, up to 1 MB; converted to a 64 × 64 icon.' },
};

export function AssetRow({ asset, url, origin, scope, disabled, removable, themeStyle, onPick, onRemove }: AssetRowProps) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const text = ASSET_TEXT[asset];

  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // picking the same file again still fires
    if (!file) return;
    const problem = imageFileError(file);
    setError(problem);
    if (problem) return;
    // data: URL — the only kind of local preview the app's CSP allows.
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && onPick(file, reader.result);
    reader.onerror = () => setError('The file could not be read.');
    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.asset}>
        <div className={cx(styles.assetPreview, asset === 'favicon' && styles.assetPreviewSquare)} style={themeStyle}>
          {url && failedUrl !== url ? (
            <img src={url} alt={`${text.title} preview`} onError={() => setFailedUrl(url)} />
          ) : (
            <LogoMark size={asset === 'favicon' ? 32 : 40} />
          )}
        </div>
        <div className={styles.assetBody}>
          <strong>{text.title}</strong>
          <span className={styles.origin}>{text.help}</span>
          <OriginLabel origin={origin} scope={scope} resetLabel={`Reset ${text.title}`} />
          <div className={styles.assetActions}>
            <input ref={input} type="file" accept={IMAGE_ACCEPT} className={styles.hiddenInput} onChange={picked} aria-label={`Upload ${text.title}`} />
            <Button size="sm" variant="secondary" leftIcon={<Upload size={14} />} disabled={disabled} onClick={() => input.current?.click()}>
              Upload
            </Button>
            {removable && (
              <Button size="sm" variant="ghost" disabled={disabled} onClick={onRemove}>
                Remove override
              </Button>
            )}
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
      </div>
    </div>
  );
}
