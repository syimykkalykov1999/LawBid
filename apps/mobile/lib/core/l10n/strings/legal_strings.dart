// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-05 (legal): disclaimers, partner rules and the DMCA form —
// compiled-in strings merged into StaticTranslatorRu/En. The `legal.fallback.*`
// texts mirror the server defaults (GET /legal/settings) and are shown only
// when that request fails.

const legalRu = <String, String>{
  // --- fallbacks for GET /legal/settings ---
  'legal.fallback.caseCreate':
      'LawBid — не юридическая фирма и не даёт юридических консультаций. Отвечающие адвокаты независимы. Не публикуйте то, что должно остаться конфиденциальным: подробности сообщайте в чате выбранному адвокату.',
  'legal.fallback.attorneyUnverified':
      'Лицензия этого адвоката указана им самим и не проверена LawBid. Проверьте её в коллегии адвокатов штата, прежде чем нанимать (ссылка на реестр — в окне уровня доверия).',
  'legal.fallback.supportNote':
      'Наша команда не даёт юридических консультаций и не рекомендует адвокатов. По юридическим вопросам опубликуйте кейс — адвокаты ответят.',
  'legal.fallback.partnerDisclosure':
      'Рассказывая о LawBid за вознаграждение, вы обязаны ясно сообщать об этом в каждом посте, видео или сообщении (например, «#реклама» или «партнёрская ссылка»). Этого требуют правила FTC о рекомендациях.',
  // --- partner rules ---
  'partner.terms.title': 'Правила партнёра',
  'partner.terms.accept': 'Принять',
  'partner.terms.checkbox': 'Я принимаю правила партнёра',
  'partner.terms.required': 'Чтобы продолжить, примите правила партнёра.',
  'partner.terms.open': 'Читать правила',
  'partner.terms.pending':
      'Правила партнёра обновились. Прочитайте и примите их — тогда ссылка снова станет доступна.',
  'partner.terms.accepted': 'Правила приняты',
  'partner.disclosure.title': 'Обязательно укажите, что это реклама',
  'partner.w9.required':
      'Перед первой выплатой нужна форма W-9 (или W-8). Напишите в поддержку, чтобы передать её.',
  // --- DMCA ---
  'dmca.title': 'Жалоба на авторские права',
  'dmca.intro':
      'Если ваша работа опубликована на LawBid без разрешения, заполните форму. Мы рассмотрим уведомление по закону DMCA.',
  'dmca.agent': 'Агент по DMCA: {name}, {email}',
  'dmca.agent.placeholder':
      'Адрес агента по авторским правам будет указан здесь',
  'dmca.field.name': 'Ваше имя',
  'dmca.field.email': 'Email',
  'dmca.field.address': 'Почтовый адрес',
  'dmca.field.phone': 'Телефон (необязательно)',
  'dmca.field.work': 'Какая работа нарушена и как',
  'dmca.field.workHint':
      'Опишите вашу работу, где она опубликована и что именно скопировано.',
  'dmca.field.url': 'Ссылка на материал',
  'dmca.field.urlHint': 'https://…',
  'dmca.goodFaith':
      'Я добросовестно полагаю, что использование материала не разрешено правообладателем, его агентом или законом.',
  'dmca.accuracy':
      'Сведения точны, и под страхом наказания за лжесвидетельство я заявляю, что являюсь правообладателем или действую от его имени.',
  'dmca.field.signature': 'Подпись (полное имя)',
  'dmca.submit': 'Отправить уведомление',
  'dmca.sent': 'Уведомление отправлено. Мы ответим по email.',
  'dmca.error': 'Не удалось отправить уведомление. Попробуйте ещё раз.',
  'dmca.error.required': 'Обязательное поле',
  'dmca.error.email': 'Введите корректный email',
  'dmca.error.short': 'Минимум {min} символов',
  'dmca.error.url': 'Введите ссылку, начинающуюся с http:// или https://',
  'dmca.error.checks': 'Отметьте оба подтверждения.',
  'dmca.target.post': 'Жалоба на публикацию',
  'dmca.target.comment': 'Жалоба на комментарий',
  'dmca.target.case_comment': 'Жалоба на комментарий к кейсу',
  'dmca.target.message': 'Жалоба на сообщение',
  'about.dmca': 'Авторские права (DMCA)',
  'cases.accept.unverifiedLine':
      'Лицензия адвоката не проверена LawBid — проверьте её в коллегии штата.',
};

const legalEn = <String, String>{
  // --- fallbacks for GET /legal/settings ---
  'legal.fallback.caseCreate':
      'LawBid is not a law firm and does not give legal advice. Attorneys who respond are independent. Do not post anything that must stay confidential: share details in the chat with the attorney you choose.',
  'legal.fallback.attorneyUnverified':
      "This attorney's license is self-declared and has not been checked by LawBid. Verify it with the state bar before you hire (the registry link is in the trust level sheet).",
  'legal.fallback.supportNote':
      'Our team cannot give legal advice or recommend an attorney. For legal questions, post a case and attorneys will answer.',
  'legal.fallback.partnerDisclosure':
      'When you tell people about LawBid for a reward you must say so clearly in every post, video or message (for example “#ad” or “partner link”). This is required by the FTC Endorsement Guides.',
  // --- partner rules ---
  'partner.terms.title': 'Partner rules',
  'partner.terms.accept': 'Accept',
  'partner.terms.checkbox': 'I accept the partner rules',
  'partner.terms.required': 'Accept the partner rules to continue.',
  'partner.terms.open': 'Read the rules',
  'partner.terms.pending':
      'The partner rules have changed. Read and accept them to get your link back.',
  'partner.terms.accepted': 'Rules accepted',
  'partner.disclosure.title': 'Always say it is an ad',
  'partner.w9.required':
      'A W-9 (or W-8) form is needed before the first payout. Contact support to send it.',
  // --- DMCA ---
  'dmca.title': 'Copyright complaint',
  'dmca.intro':
      'If your work was posted on LawBid without permission, fill in this form. We handle notices under the DMCA.',
  'dmca.agent': 'DMCA agent: {name}, {email}',
  'dmca.agent.placeholder': 'The copyright agent address will appear here',
  'dmca.field.name': 'Your name',
  'dmca.field.email': 'Email',
  'dmca.field.address': 'Postal address',
  'dmca.field.phone': 'Phone (optional)',
  'dmca.field.work': 'Which work is infringed and how',
  'dmca.field.workHint':
      'Describe your work, where it is published and what exactly was copied.',
  'dmca.field.url': 'Link to the material',
  'dmca.field.urlHint': 'https://…',
  'dmca.goodFaith':
      'I have a good-faith belief that the use of the material is not authorized by the copyright owner, its agent or the law.',
  'dmca.accuracy':
      'The information is accurate and, under penalty of perjury, I am the copyright owner or authorized to act on their behalf.',
  'dmca.field.signature': 'Signature (full name)',
  'dmca.submit': 'Send the notice',
  'dmca.sent': 'Notice sent. We will reply by email.',
  'dmca.error': 'Could not send the notice. Please try again.',
  'dmca.error.required': 'Required',
  'dmca.error.email': 'Enter a valid email',
  'dmca.error.short': 'At least {min} characters',
  'dmca.error.url': 'Enter a link starting with http:// or https://',
  'dmca.error.checks': 'Tick both statements.',
  'dmca.target.post': 'Complaint about a post',
  'dmca.target.comment': 'Complaint about a comment',
  'dmca.target.case_comment': 'Complaint about a case comment',
  'dmca.target.message': 'Complaint about a message',
  'about.dmca': 'Copyright (DMCA)',
  'cases.accept.unverifiedLine':
      "The attorney's license is not checked by LawBid — verify it with the state bar.",
};
