'use client';

import { BookOpenText } from '@phosphor-icons/react';
import { useState } from 'react';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DESK_ROLE_LABEL, type DeskRole } from '@/lib/desk';
import { deskGuide } from '@/lib/desk-guide';

/** The «Инструкция» button of the desk and the sheet it opens. */
export function DeskGuideButton({ role }: { role: DeskRole }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <BookOpenText size={14} />
        Инструкция
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} eyebrow="Инструкция" title={DESK_ROLE_LABEL[role]} wide>
        <Markdown source={deskGuide(role)} />
      </Dialog>
    </>
  );
}
