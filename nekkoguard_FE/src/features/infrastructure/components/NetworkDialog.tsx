import { useMutation } from '@tanstack/react-query';
import { Network } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { tenancyApi, type NetworkDto, type SiteDto } from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { SelectField } from '@/components/SelectField/SelectField';
import { TextField } from '@/components/TextField/TextField';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/lib/apiForm';

interface NetworkDialogProps {
  tenantId: string;
  orgId: string;
  sites: SiteDto[];
  /** Edit this network; create when absent. */
  network?: NetworkDto;
  defaultSite: string | null;
  onClose: () => void;
  onSaved: (network: NetworkDto) => void;
}

const FIELDS = ['site', 'name', 'cidr', 'description'] as const;

/** Create/edit a network. Only this Organization's sites can be chosen (the backend checks too). */
export function NetworkDialog({ tenantId, orgId, sites, network, defaultSite, onClose, onSaved }: NetworkDialogProps) {
  const [site, setSite] = useState(network?.site ?? defaultSite ?? sites[0]?.id ?? '');
  const [name, setName] = useState(network?.name ?? '');
  const [cidr, setCidr] = useState(network?.cidr ?? '');
  const [description, setDescription] = useState(network?.description ?? '');
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);

  const save = useMutation({
    mutationFn: () => {
      const body = { site, name: name.trim(), cidr: cidr.trim(), description: description.trim() };
      return network
        ? tenancyApi.updateNetwork(tenantId, orgId, network.id, body)
        : tenancyApi.createNetwork(tenantId, orgId, body);
    },
    onSuccess: (saved) => {
      onSaved(saved);
      onClose();
    },
    onError: (error) => setErrors(toFormErrors(error, FIELDS)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields: Record<string, string> = {};
    if (!site) fields.site = 'Choose a site.';
    if (!name.trim()) fields.name = 'Enter a name.';
    setErrors({ fields, form: null });
    if (Object.keys(fields).length === 0) save.mutate();
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      icon={<Network size={18} />}
      title={network ? `Edit ${network.name}` : 'Add a network'}
    >
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        <SelectField
          label="Site"
          value={site}
          options={sites.map((s) => ({ value: s.id, label: s.name }))}
          onChange={setSite}
          error={errors.fields.site ?? null}
        />
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.fields.name ?? null}
          maxLength={120}
          autoFocus
        />
        <TextField
          label="Address range (CIDR)"
          value={cidr}
          onChange={(event) => setCidr(event.target.value)}
          error={errors.fields.cidr ?? null}
          placeholder="192.0.2.0/24"
          hint="Optional. The network address, e.g. 192.0.2.0/24."
          spellCheck={false}
          maxLength={43}
        />
        <TextField
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.fields.description ?? null}
          maxLength={500}
          hint="Optional."
        />
        <div className={formStyles.actions}>
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {network ? 'Save' : 'Add network'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
