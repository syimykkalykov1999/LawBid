/** AAD of the sealed metadata fields (S3-5): `<table.column>:<row id>`, so a
 * sealed value copied onto another row fails to open. */
export const fileNameAad = (messageId: string): string =>
  `messages.file_name:${messageId}`;
export const privateDetailsAad = (caseId: string): string =>
  `cases.private_details:${caseId}`;
export const journalTextAad = (journalId: string): string =>
  `case_journal.payload:${journalId}`;
