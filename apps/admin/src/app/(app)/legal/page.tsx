import { redirect } from 'next/navigation';

/** Moved: all legal documents are edited in «Юридические документы». */
export default function LegacyLegalRedirect() {
  redirect('/legal-documents');
}
