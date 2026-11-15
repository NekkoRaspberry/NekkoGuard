import { useMutation } from '@tanstack/react-query';
import { Bug, CheckCircle2, ChevronDown, ImagePlus, Paperclip, X } from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import {
  helpApi,
  type BugCategory,
  type BugReportContext,
  type BugReportInput,
  type BugReportResultDto,
  type BugSeverity,
} from '@/api/help';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { KeyValueGrid } from '@/components/KeyValueGrid/KeyValueGrid';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { SelectField } from '@/components/SelectField/SelectField';
import { TextAreaField } from '@/components/TextAreaField/TextAreaField';
import { TextField } from '@/components/TextField/TextField';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useTenancy } from '@/features/tenancy/hooks';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/lib/apiForm';
import { cx } from '@/lib/cx';
import { ATTACHMENT_TYPES, CATEGORY_OPTIONS, SEVERITY_OPTIONS, validateAttachment } from '../bugReport';
import { collectBrowserContext } from '../browserContext';
import styles from './BugReportDialog.module.css';

const TITLE_MAX = 150;
const TEXT_MAX = 5000;
const FIELDS = [
  'title',
  'description',
  'category',
  'severity',
  'steps_to_reproduce',
  'expected_behavior',
  'actual_behavior',
  'additional_comments',
  'attachment',
  'tenant',
  'organization',
] as const;

type Step = 'describe' | 'review' | 'done';

interface Draft {
  title: string;
  description: string;
  category: BugCategory | '';
  severity: BugSeverity | '';
  steps_to_reproduce: string;
  expected_behavior: string;
  actual_behavior: string;
  additional_comments: string;
}

const EMPTY: Draft = {
  title: '',
  description: '',
  category: '',
  severity: '',
  steps_to_reproduce: '',
  expected_behavior: '',
  actual_behavior: '',
  additional_comments: '',
};

function newToken(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : // Fallback for non-secure contexts (plain-HTTP LAN access): RFC 4122 v4 from getRandomValues.
      '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (Number(c) ^ ((crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) & (15 >> (Number(c) / 4)))).toString(16),
      );
}

function optionLabel<V extends string>(options: { value: V; label: string }[], value: V): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/**
 * Help › Report a bug. Two steps (describe → review & send), then the outcome.
 * The backend decides the recipient and re-checks the Tenant/Organization context.
 */
export function BugReportDialog({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const { currentTenant, currentOrganization } = useTenancy();
  const me = useCurrentUser().data;
  const fileInput = useRef<HTMLInputElement>(null);
  const fileHintId = useId();

  const [step, setStep] = useState<Step>('describe');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [moreDetails, setMoreDetails] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);
  // Fixed for this draft: a retry (double click, timeout) never creates a second report.
  const [clientToken] = useState(newToken);
  const [context] = useState<BugReportContext>(() => collectBrowserContext(pathname));
  const [result, setResult] = useState<BugReportResultDto | null>(null);
  // Synchronous guard: two clicks in the same tick both see isPending === false.
  const sending = useRef(false);

  const submit = useMutation({
    mutationFn: () => {
      const input: BugReportInput = {
        client_token: clientToken,
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        tenant: currentTenant?.id ?? null,
        organization: currentOrganization?.id ?? null,
        context,
        attachment,
      };
      return helpApi.submitBugReport(input);
    },
    onSuccess: (saved) => {
      setResult(saved);
      setStep('done');
    },
    onError: (error) => {
      const parsed = toFormErrors(error, FIELDS);
      setErrors(parsed);
      // Field problems are fixed on the first step.
      if (Object.keys(parsed.fields).length > 0) setStep('describe');
    },
  });

  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = ''; // allow picking the same file again after removing it
    if (!file) return;
    const problem = validateAttachment(file);
    setErrors((current) => {
      const fields = { ...current.fields };
      if (problem) fields.attachment = problem;
      else delete fields.attachment;
      return { ...current, fields };
    });
    if (!problem) setAttachment(file);
  }

  function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields: Record<string, string> = {};
    if (!draft.title.trim()) fields.title = 'Give the problem a short title.';
    if (!draft.description.trim()) fields.description = 'Describe what went wrong.';
    setErrors({ fields, form: null });
    if (Object.keys(fields).length === 0) setStep('review');
  }

  function send() {
    if (sending.current) return;
    sending.current = true;
    submit.mutate(undefined, {
      onSettled: () => {
        sending.current = false;
      },
    });
  }

  const close = () => {
    if (!submit.isPending) onClose();
  };

  if (step === 'done' && result) {
    const emailed = result.email_status === 'sent';
    return (
      <Modal open onOpenChange={(open) => !open && onClose()} size="md" icon={<CheckCircle2 size={18} />} title="Report submitted">
        <div className={formStyles.form}>
          {emailed ? (
            <Banner tone="success" title="Thank you — your report was sent">
              The support team received it by email and may reply to you at {me?.email ?? 'your account address'}.
            </Banner>
          ) : (
            <Banner tone="warning" title="Your report was saved, but not emailed">
              {result.email_status === 'not_configured'
                ? 'No support email address is configured yet, so nobody was notified automatically. An administrator can still see your report.'
                : 'The email could not be delivered. Your report is saved and an administrator can still see it.'}
            </Banner>
          )}
          <p className={styles.reference}>
            Reference <span className={styles.mono}>{result.id.slice(0, 8)}</span>
          </p>
          <div className={formStyles.actions}>
            <div className={formStyles.actionsEnd}>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'review') {
    const optional: { label: string; value: string }[] = [
      { label: 'Category', value: draft.category && optionLabel(CATEGORY_OPTIONS, draft.category) },
      { label: 'Severity', value: draft.severity && optionLabel(SEVERITY_OPTIONS, draft.severity) },
      { label: 'Steps to reproduce', value: draft.steps_to_reproduce.trim() },
      { label: 'Expected behavior', value: draft.expected_behavior.trim() },
      { label: 'Actual behavior', value: draft.actual_behavior.trim() },
      { label: 'Additional comments', value: draft.additional_comments.trim() },
      { label: 'Screenshot', value: attachment?.name ?? '' },
    ].filter((item) => item.value);
    const contextItems = [
      { label: 'Your account', value: me?.email ?? '' },
      { label: 'Tenant', value: currentTenant?.name ?? '' },
      { label: 'Organization', value: currentOrganization?.name ?? '' },
      { label: 'Page', value: context.page },
      { label: 'NekkoGuard version', value: context.client_version },
      { label: 'Browser', value: context.browser },
      { label: 'Operating system', value: context.operating_system },
      { label: 'Window size', value: context.viewport.replace('x', ' × ') },
    ].filter((item) => item.value);

    return (
      <Modal
        open
        onOpenChange={(open) => !open && close()}
        dismissible={!submit.isPending}
        size="md"
        icon={<Bug size={18} />}
        title="Review your report"
        description="Check what will be sent. Nothing is sent until you choose Send report."
      >
        <div className={formStyles.form}>
          {errors.form && <Banner tone="danger">{errors.form}</Banner>}
          <section className={styles.review} aria-label="Your report">
            <p className={styles.reviewTitle}>{draft.title.trim()}</p>
            <p className={styles.reviewText}>{draft.description.trim()}</p>
            {optional.length > 0 && <KeyValueGrid items={optional.map((item) => ({ label: item.label, value: <span className={styles.preWrap}>{item.value}</span> }))} />}
          </section>
          <section className={styles.contextBox} aria-labelledby="bug-context-title">
            <p id="bug-context-title" className={styles.contextTitle}>
              Included automatically
            </p>
            <p className={styles.contextText}>
              These details help the support team reproduce the problem. No passwords, cookies, page contents or infrastructure data are
              included, and no screenshot is taken unless you attach one.
            </p>
            <KeyValueGrid items={contextItems} />
          </section>
          <div className={formStyles.actions}>
            <Button variant="ghost" onClick={() => setStep('describe')} disabled={submit.isPending}>
              Back
            </Button>
            <div className={formStyles.actionsEnd}>
              <Button variant="ghost" onClick={close} disabled={submit.isPending}>
                Cancel
              </Button>
              <Button variant="primary" loading={submit.isPending} disabled={submit.isPending} onClick={send}>
                Send report
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && close()}
      size="md"
      icon={<Bug size={18} />}
      title="Report a bug"
      description="Tell us what went wrong. Only a title and a description are required."
    >
      <form className={formStyles.form} onSubmit={handleReview} noValidate>
        {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        <TextField
          label="Title"
          value={draft.title}
          maxLength={TITLE_MAX}
          placeholder="e.g. Export button does nothing on Members"
          onChange={(event) => set('title')(event.target.value)}
          error={errors.fields.title ?? null}
          autoFocus
        />
        <TextAreaField
          label="Description"
          value={draft.description}
          maxLength={TEXT_MAX}
          rows={5}
          placeholder="What happened, and where?"
          onChange={(event) => set('description')(event.target.value)}
          error={errors.fields.description ?? null}
        />
        <div className={styles.pair}>
          <SelectField label="Category" value={draft.category} options={CATEGORY_OPTIONS} onChange={set('category')} error={errors.fields.category ?? null} />
          <SelectField label="Severity" value={draft.severity} options={SEVERITY_OPTIONS} onChange={set('severity')} error={errors.fields.severity ?? null} />
        </div>

        <button type="button" className={styles.disclosure} aria-expanded={moreDetails} onClick={() => setMoreDetails((v) => !v)}>
          <ChevronDown size={14} className={cx(styles.disclosureIcon, moreDetails && styles.disclosureOpen)} aria-hidden="true" />
          More details (optional)
        </button>
        {moreDetails && (
          <div className={styles.details}>
            <TextAreaField
              label="Steps to reproduce"
              value={draft.steps_to_reproduce}
              maxLength={TEXT_MAX}
              placeholder={'1. Open …\n2. Click …\n3. …'}
              onChange={(event) => set('steps_to_reproduce')(event.target.value)}
              error={errors.fields.steps_to_reproduce ?? null}
            />
            <div className={styles.pair}>
              <TextAreaField
                label="Expected behavior"
                value={draft.expected_behavior}
                maxLength={TEXT_MAX}
                rows={3}
                onChange={(event) => set('expected_behavior')(event.target.value)}
                error={errors.fields.expected_behavior ?? null}
              />
              <TextAreaField
                label="Actual behavior"
                value={draft.actual_behavior}
                maxLength={TEXT_MAX}
                rows={3}
                onChange={(event) => set('actual_behavior')(event.target.value)}
                error={errors.fields.actual_behavior ?? null}
              />
            </div>
            <TextAreaField
              label="Additional comments"
              value={draft.additional_comments}
              maxLength={TEXT_MAX}
              rows={3}
              onChange={(event) => set('additional_comments')(event.target.value)}
              error={errors.fields.additional_comments ?? null}
            />
          </div>
        )}

        <div className={styles.attachment}>
          <span className={styles.attachmentLabel}>Screenshot</span>
          {attachment ? (
            <span className={styles.file}>
              <Paperclip size={14} aria-hidden="true" />
              <span className={styles.fileName}>{attachment.name}</span>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${attachment.name}`} onClick={() => setAttachment(null)}>
                <X size={14} />
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="secondary" leftIcon={<ImagePlus size={14} />} onClick={() => fileInput.current?.click()} aria-describedby={fileHintId}>
              Attach screenshot
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={ATTACHMENT_TYPES.join(',')}
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Screenshot file"
            onChange={handleFile}
          />
          {errors.fields.attachment ? (
            <span className={styles.fieldError} role="alert">
              {errors.fields.attachment}
            </span>
          ) : (
            <span id={fileHintId} className={styles.hint}>
              Optional. PNG, JPEG or WebP up to 2 MB.
            </span>
          )}
        </div>

        <div className={formStyles.actions}>
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Review report
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
