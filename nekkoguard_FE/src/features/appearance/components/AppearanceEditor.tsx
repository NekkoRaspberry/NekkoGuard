import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image, LayoutPanelLeft, Palette } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { appearanceApi, COLOR_FIELDS, type AppearanceAsset, type AppearanceDto, type AppearanceValues } from '@/api/appearance';
import { getErrorMessage, isApiError } from '@/api/errors';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/Card/Card';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { TextField } from '@/components/TextField/TextField';
import { useToast } from '@/components/Toast/useToast';
import { useTenantName } from '@/features/tenancy/hooks';
import { assetPreview, changedValues, draftFrom, isDirty, originOf, previewOf, type Draft } from '../draft';
import { contrastWarnings, DEFAULT_NAVBAR_POSITION, DEFAULT_TITLE, isolatedThemeVariables } from '../theme';
import { AssetRow, ColorRow, NavPositionField, OriginLabel } from './Fields';
import { PreviewPanel } from './PreviewPanel';
import styles from './Appearance.module.css';

interface AppearanceEditorProps {
  tenantId: string;
  /** null = the Tenant's own appearance (the default of its Organizations). */
  orgId: string | null;
  dto: AppearanceDto;
}

const ASSETS: AppearanceAsset[] = ['logo', 'favicon'];

/** Every appearance query (any scope): a change can affect Organizations inheriting it. */
const isAppearanceKey = (key: readonly unknown[]) => key.includes('appearance');

/**
 * Edit one scope's appearance: draft → live preview → Save / Cancel / Reset.
 * Mount with a `key` per scope so a scope switch never carries a draft over.
 */
export function AppearanceEditor({ tenantId, orgId, dto }: AppearanceEditorProps) {
  const tenantName = useTenantName(tenantId);
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(dto));
  const [base, setBase] = useState(dto);
  const [confirmReset, setConfirmReset] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const layoutRef = useRef<HTMLDivElement>(null);
  const brandingRef = useRef<HTMLDivElement>(null);

  // The preview card is at least as tall as the Branding card next to it. Written as a
  // CSS variable (no re-render); unused when the columns stack (see the CSS).
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const branding = brandingRef.current;
    if (!layout || !branding || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => layout.style.setProperty('--branding-height', `${branding.offsetHeight}px`));
    observer.observe(branding);
    return () => observer.disconnect();
  }, []);

  // Fresh server data (after a save or a refetch) replaces the draft only when clean.
  if (dto !== base) {
    setBase(dto);
    if (!isDirty(base, draft)) setDraft(draftFrom(dto));
  }

  const scope = dto.scope;
  const disabled = !dto.can_manage;
  const dirty = isDirty(dto, draft);
  const preview = previewOf(dto, draft);
  const warnings = contrastWarnings(preview.colors);
  const themeStyle = isolatedThemeVariables(preview.overrides) as CSSProperties;

  const setValue = <K extends keyof AppearanceValues>(field: K, value: AppearanceValues[K]) =>
    setDraft((current) => ({ ...current, values: { ...current.values, [field]: value } }));

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ predicate: (query) => isAppearanceKey(query.queryKey) });
    notify({ tone: 'success', title: message });
  };

  const save = useMutation({
    mutationFn: async () => {
      const changes = changedValues(dto, draft);
      if (Object.keys(changes).length > 0) await appearanceApi.update(tenantId, orgId, changes);
      for (const asset of ASSETS) {
        const pending = draft.assets[asset];
        if (pending.kind === 'upload') await appearanceApi.uploadAsset(tenantId, orgId, asset, pending.file);
        if (pending.kind === 'remove') await appearanceApi.removeAsset(tenantId, orgId, asset);
      }
      return appearanceApi.get(tenantId, orgId);
    },
    onSuccess: async (fresh) => {
      setFieldErrors({});
      setDraft(draftFrom(fresh));
      await finish('Appearance saved');
    },
    onError: async (error) => {
      if (isApiError(error)) setFieldErrors(error.fieldErrors);
      // Part of the save may have gone through: show the server state again.
      await queryClient.invalidateQueries({ predicate: (query) => isAppearanceKey(query.queryKey) });
    },
  });

  const reset = useMutation({
    mutationFn: () => appearanceApi.reset(tenantId, orgId),
    onSuccess: async (fresh) => {
      setConfirmReset(false);
      setDraft(draftFrom(fresh));
      await finish('Appearance reset');
    },
  });

  const titleOrigin = originOf(draft.values.title, dto.inherited.title);
  const navOrigin = originOf(draft.values.navbar_position, dto.inherited.navbar_position);
  const hasOwnSettings = configuresAnything(dto);

  return (
    <div className={styles.layout} ref={layoutRef}>
      <div className={styles.settings}>
        {disabled && <Banner tone="info">You can view this appearance but not change it.</Banner>}

        <div ref={brandingRef}>
          <Card>
            <CardHeader icon={<Image size={18} />} title="Branding" description="Name, logo and browser tab icon shown after sign-in." />
            <CardBody className={styles.fields}>
              <TextField
                label="Application title"
                value={draft.values.title ?? ''}
                placeholder={dto.inherited.title ?? DEFAULT_TITLE}
                maxLength={60}
                disabled={disabled}
                onChange={(event) => setValue('title', event.target.value === '' ? null : event.target.value)}
                error={fieldErrors.title?.[0] ?? null}
                hint={
                  <OriginLabel
                    origin={titleOrigin}
                    scope={scope}
                    onReset={() => setValue('title', null)}
                    resetLabel="Reset application title"
                    disabled={disabled}
                  />
                }
              />
              {ASSETS.map((asset) => {
                const shown = assetPreview(dto, draft, asset);
                const pending = draft.assets[asset];
                return (
                  <AssetRow
                    key={asset}
                    asset={asset}
                    url={shown.url}
                    origin={shown.origin}
                    scope={scope}
                    disabled={disabled}
                    removable={pending.kind === 'upload' || (pending.kind === 'keep' && dto.configured[asset])}
                    themeStyle={themeStyle}
                    onPick={(file, dataUrl) =>
                      setDraft((current) => ({ ...current, assets: { ...current.assets, [asset]: { kind: 'upload', file, preview: dataUrl } } }))
                    }
                    onRemove={() =>
                      setDraft((current) => ({
                        ...current,
                        assets: { ...current.assets, [asset]: dto.configured[asset] ? { kind: 'remove' } : { kind: 'keep' } },
                      }))
                    }
                  />
                );
              })}
              {(['file', 'logo', 'favicon'] as const).map((key) =>
                fieldErrors[key]?.[0] ? (
                  <p key={key} className={styles.error} role="alert">
                    {fieldErrors[key][0]}
                  </p>
                ) : null,
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader icon={<Palette size={18} />} title="Theme colors" description="Pick a color or type a hex value. Unset colors keep the inherited theme." />
          <CardBody className={styles.colorGrid}>
            {COLOR_FIELDS.map((field) => (
              <ColorRow
                key={field}
                field={field}
                own={draft.values[field]}
                inherited={dto.inherited[field]}
                scope={scope}
                disabled={disabled}
                onChange={(value) => setValue(field, value)}
              />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<LayoutPanelLeft size={18} />} title="Navigation position" description="Where the main navigation is shown on desktop. Small screens always use the slide-out menu." />
          <CardBody>
            <NavPositionField
              value={draft.values.navbar_position ?? dto.inherited.navbar_position ?? DEFAULT_NAVBAR_POSITION}
              origin={navOrigin}
              scope={scope}
              disabled={disabled}
              onChange={(value) => setValue('navbar_position', value)}
            />
          </CardBody>
          {!disabled && (
            <CardFooter className={styles.footer}>
              <Button variant="danger" size="sm" disabled={!hasOwnSettings || save.isPending} onClick={() => setConfirmReset(true)}>
                Reset all
              </Button>
              <div className={styles.footerActions}>
                <Button variant="ghost" disabled={!dirty || save.isPending} onClick={() => setDraft(draftFrom(dto))}>
                  Cancel
                </Button>
                <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                  Save changes
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
        {save.isError && <Banner tone="danger" title="Not saved">{getErrorMessage(save.error)}</Banner>}
      </div>

      <aside className={styles.previewColumn} aria-label="Live preview">
        <Card className={styles.previewFrame}>
          <CardHeader title="Live preview" description={dirty ? 'Unsaved changes — only this preview shows them.' : 'As users see it now.'} />
          <CardBody>
            <PreviewPanel preview={preview} orgId={orgId} />
          </CardBody>
        </Card>
        {warnings.length > 0 && (
          <Banner tone="warning" title="Low contrast">
            <ul className={styles.warnings}>
              {warnings.map((warning) => (
                <li key={warning.id}>{warning.message}</li>
              ))}
            </ul>
          </Banner>
        )}
      </aside>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset all appearance settings?"
        description={
          scope === 'organization'
            ? `This organization will use the ${tenantName} appearance (or the NekkoGuard default) again.`
            : `${tenantName} and the organizations that do not override it will use the NekkoGuard default again.`
        }
        confirmLabel="Reset all"
        tone="danger"
        loading={reset.isPending}
        onConfirm={() => reset.mutate()}
      />
    </div>
  );
}

/** Does this scope configure anything itself? */
function configuresAnything(dto: AppearanceDto): boolean {
  return Object.values(dto.configured).some((value) => value !== null && value !== false);
}
