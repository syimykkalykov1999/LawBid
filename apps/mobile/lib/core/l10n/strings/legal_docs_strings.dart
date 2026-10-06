// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-05 (legal documents): the acceptance screen, the titles of
// every legal document and the «updated documents» error — compiled-in
// strings merged into StaticTranslatorRu/En. The texts of the documents
// themselves come from the server (GET /legal/documents/:type).

const legalDocsRu = <String, String>{
  // --- acceptance screen ---
  'legalAccept.title': 'Юридические документы',
  'legalAccept.intro':
      'Чтобы продолжить, прочитайте и примите документы ниже. Мы просим об этом, когда появляется новый документ или меняются условия.',
  'legalAccept.read': 'Читать полностью',
  'legalAccept.check': 'Я прочитал(а) и принимаю: {title}',
  'legalAccept.accept': 'Принять',
  'legalAccept.hint': 'Отметьте каждый документ, чтобы продолжить.',
  'legalAccept.updated': 'обновлён',
  'legalAccept.signOut': 'Выйти из аккаунта',
  // --- document titles ---
  'legal.doc.attorney_agreement': 'Соглашение с адвокатом',
  'legal.doc.client_agreement': 'Соглашение с клиентом',
  'legal.doc.eula': 'Лицензионное соглашение (EULA)',
  'legal.doc.refund': 'Политика возвратов',
  'legal.doc.cookies': 'Политика cookie',
  'legal.doc.third_party_services': 'Сторонние сервисы',
  'legal.doc.partner_terms': 'Условия для партнёров',
  'legal.doc.dmca_policy': 'Политика авторских прав (DMCA)',
  // --- Settings → About ---
  'about.documents': 'Юридические документы',
  // --- errors ---
  'error.api.LEGAL_REACCEPT_REQUIRED':
      'Сначала примите обновлённые юридические документы.',
};

const legalDocsEn = <String, String>{
  // --- acceptance screen ---
  'legalAccept.title': 'Legal documents',
  'legalAccept.intro':
      'To continue, please read and accept the documents below. We ask when a new document appears or the terms change.',
  'legalAccept.read': 'Read in full',
  'legalAccept.check': 'I have read and accept: {title}',
  'legalAccept.accept': 'Accept',
  'legalAccept.hint': 'Tick every document to continue.',
  'legalAccept.updated': 'updated',
  'legalAccept.signOut': 'Sign out',
  // --- document titles ---
  'legal.doc.attorney_agreement': 'Attorney Agreement',
  'legal.doc.client_agreement': 'Client Agreement',
  'legal.doc.eula': 'End User License Agreement',
  'legal.doc.refund': 'Refund Policy',
  'legal.doc.cookies': 'Cookie Policy',
  'legal.doc.third_party_services': 'Third-Party Services',
  'legal.doc.partner_terms': 'Partner Terms',
  'legal.doc.dmca_policy': 'Copyright (DMCA) Policy',
  // --- Settings → About ---
  'about.documents': 'Legal documents',
  // --- errors ---
  'error.api.LEGAL_REACCEPT_REQUIRED':
      'Please accept the updated legal documents first.',
};
