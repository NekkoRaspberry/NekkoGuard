import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FilePenLine, Pencil, Save, Send, Trash2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { termsApi, type TermsDocumentJson, type TermsVersionDto, type TermsVersionsDto } from '@/api/terms';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { TextField } from '@/components/TextField/TextField';
import { useToast } from '@/components/Toast/useToast';
import { cx } from '@/lib/cx';
import { formatCalendarDate, formatTime } from '@/lib/format';
import { isEmptyDocument } from '../document';
import { useRefreshTerms } from '../hooks';
import { TermsReader } from './TermsDocument';
import styles from './Terms.module.css';

// Tiptap is only downloaded by administrators who open the editor.
const TermsEditor = lazy(async () => ({ default: (await import('../editor/TermsEditor')).TermsEditor }));

type Mode = 'edit' | 'preview';

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function DraftEditor({
  tenantId,
  tenantName,
  draft,
  nextNumber,
  pendingCount,
}: {
  tenantId: string;
  tenantName: string;
  draft: TermsVersionDto;
  nextNumber: number;
  pendingCount: number;
}) {
  const queryClient = useQueryClient();
  const refresh = useRefreshTerms(tenantId);
  const { notify } = useToast();
  const [title, setTitle] = useState(draft.title);
  const [doc, setDoc] = useState<TermsDocumentJson>(draft.content);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('edit');
  const [confirm, setConfirm] = useState<'publish' | 'discard' | null>(null);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => termsApi.updateDraft(tenantId, draft.id, { title, content: doc }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.termsVersion(tenantId, draft.id), saved);
      setDirty(false);
      setSavedAt(Date.now());
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync();
      return termsApi.publish(tenantId, draft.id);
    },
    onSuccess: (published) => {
      setConfirm(null);
      refresh();
      notify({ tone: 'success', title: `Version ${published.number} published`, description: 'Members are asked to accept it at their next request.' });
    },
  });

  const discard = useMutation({
    mutationFn: () => termsApi.discardDraft(tenantId, draft.id),
    onSuccess: () => {
      setConfirm(null);
      setDirty(false);
      refresh();
      notify({ tone: 'success', title: 'Draft discarded' });
    },
  });

  const error = save.error ?? publish.error ?? discard.error;
  const empty = isEmptyDocument(doc);

  return (
    <div className={styles.panel}>
      {error && <Banner tone="danger">{getErrorMessage(error)}</Banner>}
      <div className={styles.toolbar}>
        <div className={styles.toolbarStart} role="tablist" aria-label="Draft view">
          <div className={styles.tabs}>
            <button type="button" role="tab" aria-selected={mode === 'edit'} className={cx(styles.tab, mode === 'edit' && styles.tabActive)} onClick={() => setMode('edit')}>
              <Pencil size={14} aria-hidden="true" /> Edit
            </button>
            <button type="button" role="tab" aria-selected={mode === 'preview'} className={cx(styles.tab, mode === 'preview' && styles.tabActive)} onClick={() => setMode('preview')}>
              <Eye size={14} aria-hidden="true" /> Preview
            </button>
          </div>
          <span className={cx(styles.saveState, dirty && styles.unsaved)} role="status">
            {save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved at ${formatTime(savedAt)}` : 'No changes'}
          </span>
        </div>
        <div className={styles.toolbarEnd}>
          <Button variant="ghost" leftIcon={<Trash2 size={14} />} onClick={() => setConfirm('discard')}>
            Discard draft
          </Button>
          <Button variant="secondary" leftIcon={<Save size={14} />} loading={save.isPending} disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            Save draft
          </Button>
          <Button variant="primary" leftIcon={<Send size={14} />} disabled={empty || !title.trim()} onClick={() => setConfirm('publish')}>
            Publish
          </Button>
        </div>
      </div>

      {mode === 'edit' ? (
        <>
          <TextField
            className={styles.titleField}
            label="Title"
            value={title}
            maxLength={150}
            onChange={(event) => {
              setTitle(event.target.value);
              setDirty(true);
            }}
          />
          <div className={styles.editorWrap}>
            <Suspense fallback={<Skeleton height={420} radius="sm" />}>
              <TermsEditor
                value={draft.content}
                onChange={(next) => {
                  setDoc(next);
                  setDirty(true);
                }}
              />
            </Suspense>
          </div>
        </>
      ) : (
        <TermsReader
          title={title || 'Untitled'}
          meta={
            <span>
              Version <span className={styles.mono}>{nextNumber}</span> · Effective {formatCalendarDate(todayIso())} once published
            </span>
          }
          doc={doc}
          prefix="preview-"
          banner={<Banner tone="info">Preview — this is exactly what members will see and accept.</Banner>}
        />
      )}

      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Publish version ${nextNumber} for ${tenantName}?`}
        description={
          <>
            Version {nextNumber} takes effect today ({formatCalendarDate(todayIso())}) and replaces the current version. Every member of{' '}
            {tenantName}
            {pendingCount > 0 ? ` (${pendingCount} people)` : ''} must accept it before using NekkoGuard again — including you. Earlier
            versions and their acceptance records stay in the history. Published text can no longer be edited.
          </>
        }
        confirmLabel={`Publish version ${nextNumber}`}
        tone="primary"
        loading={publish.isPending}
        onConfirm={() => publish.mutate()}
      />
      <ConfirmDialog
        open={confirm === 'discard'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Discard this draft?"
        description="The draft and its unsaved changes are deleted. The current published version is not affected."
        confirmLabel="Discard draft"
        loading={discard.isPending}
        onConfirm={() => discard.mutate()}
      />
    </div>
  );
}

/** Drafts: write the next version without affecting the current one. */
export function DraftPanel({ tenantId, tenantName, versions }: { tenantId: string; tenantName: string; versions: TermsVersionsDto }) {
  const queryClient = useQueryClient();
  const draftSummary = versions.versions.find((v) => v.status === 'draft');
  const nextNumber = Math.max(0, ...versions.versions.map((v) => v.number ?? 0)) + 1;

  const draft = useQuery({
    queryKey: queryKeys.termsVersion(tenantId, draftSummary?.id ?? ''),
    queryFn: ({ signal }) => termsApi.version(tenantId, draftSummary?.id ?? '', signal),
    enabled: draftSummary !== undefined,
  });

  const create = useMutation({
    mutationFn: () => termsApi.createDraft(tenantId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.termsVersions(tenantId) }),
  });

  if (!draftSummary) {
    const hasCurrent = versions.versions.some((v) => v.status === 'current');
    return (
      <Card>
        <div className={styles.empty}>
          <FilePenLine size={28} aria-hidden="true" />
          <p className={styles.emptyTitle}>No draft in progress</p>
          <p>
            {hasCurrent
              ? 'A new version starts as a copy of the current one. It stays private until you publish it.'
              : 'The first version starts from a template structure — replace it with your approved terms before publishing.'}
          </p>
          {create.isError && <Banner tone="danger">{getErrorMessage(create.error)}</Banner>}
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
            {hasCurrent ? 'New version' : 'Write the first version'}
          </Button>
        </div>
      </Card>
    );
  }
  if (draft.isPending) return <Skeleton height={420} radius="sm" />;
  if (draft.isError) return <ErrorState error={draft.error} onRetry={() => void draft.refetch()} retrying={draft.isFetching} />;
  return (
    <DraftEditor
      key={draft.data.id}
      tenantId={tenantId}
      tenantName={tenantName}
      draft={draft.data}
      nextNumber={nextNumber}
      pendingCount={versions.current_stats.required}
    />
  );
}
