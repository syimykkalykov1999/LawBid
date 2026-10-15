'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label, Select, Textarea } from '@/components/ui/input';
import { DOC_TEMPLATE_RU, DOC_TEMPLATES, type DocTemplate } from '@/lib/trust-labels';

export const TRUST_NOTE_MAX = 500;

type DocumentRequest = { template: DocTemplate; note: string } | null;

/**
 * «Запросить ещё»: pick what the attorney must upload (template) and add a
 * note that goes to them. `const { askDocuments, dialog } = useDocumentRequest()`.
 */
export function useDocumentRequest() {
  const [state, setState] = useState<{ title: string; resolve: (r: DocumentRequest) => void } | null>(null);
  const askDocuments = useCallback(
    (title = 'Запросить ещё') => new Promise<DocumentRequest>((resolve) => setState({ title, resolve })),
    [],
  );
  const dialog = state ? (
    <DocumentRequestDialog
      title={state.title}
      onClose={(r) => {
        state.resolve(r);
        setState(null);
      }}
    />
  ) : null;
  return { askDocuments, dialog };
}

function DocumentRequestDialog({ title, onClose }: { title: string; onClose: (r: DocumentRequest) => void }) {
  const [template, setTemplate] = useState<DocTemplate>('id_selfie');
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const ok = trimmed.length <= TRUST_NOTE_MAX && (template !== 'custom' || trimmed.length >= 3);
  return (
    <Dialog
      open
      onClose={() => onClose(null)}
      title={title}
      description="Адвокат получит уведомление с просьбой загрузить документы и вашей заметкой; ставки и выплаты ждут проверки."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onClose({ template, note: trimmed });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="doc-template">Что запросить</Label>
          <Select id="doc-template" value={template} onChange={(e) => setTemplate(e.target.value as DocTemplate)}>
            {DOC_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {DOC_TEMPLATE_RU[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-note">
            Заметка адвокату {template === 'custom' ? <span className="ml-1 text-xs font-normal text-muted">(обязательна)</span> : <span className="ml-1 text-xs font-normal text-muted">(необязательно)</span>}
          </Label>
          <Textarea id="doc-note" autoFocus rows={4} maxLength={TRUST_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="text-right text-xs text-faint">
            {trimmed.length}/{TRUST_NOTE_MAX}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onClose(null)}>
            Отмена
          </Button>
          <Button type="submit" disabled={!ok}>
            Отправить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
