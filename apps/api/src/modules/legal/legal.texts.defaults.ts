/**
 * Owner 2026-10-25 (legal texts, L-TEXT): the short legal strings in the
 * ten legal languages. en and ru are written by hand; es fr de it pt nl pl
 * uk are machine translations of the English text and are flagged "needs
 * review" in the admin (Система → Право и жалобы) until a person has read
 * them and cleared the flag. Everything here is only a DEFAULT: the owner
 * edits every string in the admin.
 */
export const LEGAL_LANGS = [
  'en',
  'ru',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'uk',
] as const;
export type LegalLang = (typeof LEGAL_LANGS)[number];

/** Languages whose default text is a machine translation. */
export const MACHINE_LANGS: readonly LegalLang[] = [
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'uk',
];

/** The strings added in 2026-10 (the older five stay in legal.settings.ts). */
export interface NewLegalTexts {
  /** Label next to attorney-created content (profile, post, bid, answer). */
  attorneyAdvertisingLabel: string;
  /** Prior-results disclaimer shown with case results and testimonials. */
  priorResultsDisclaimer: string;
  /** What the attorney badges mean (a check against a public registry, not
   * a recommendation). */
  badgeExplainer: string;
  /** Note on the public Q&A: the asker chooses the best answer. */
  bestAnswerNote: string;
  /** Note on machine-translated messages and texts. */
  translationNote: string;
  /** Warning when an attorney replies publicly to a review. */
  reviewReplyWarning: string;
  /** Label on paid placements (boosts, promoted profiles). */
  sponsoredLabel: string;
}
export type NewLegalTextKey = keyof NewLegalTexts;

export const NEW_TEXT_LIMITS: Record<NewLegalTextKey, number> = {
  attorneyAdvertisingLabel: 120,
  priorResultsDisclaimer: 300,
  badgeExplainer: 500,
  bestAnswerNote: 300,
  translationNote: 300,
  reviewReplyWarning: 400,
  sponsoredLabel: 60,
};

export const NEW_TEXTS: Record<LegalLang, NewLegalTexts> = {
  en: {
    attorneyAdvertisingLabel: 'Attorney Advertising',
    priorResultsDisclaimer:
      'Prior results do not guarantee a similar outcome. Every case is different.',
    badgeExplainer:
      'A badge shows what LawBid checked, for example that a license number matched the state bar registry on a given date. It is not a recommendation, ranking or opinion about the quality of an attorney. Check the attorney yourself before you hire.',
    bestAnswerNote:
      'The person who asked the question chose this answer. It is general information, not legal advice, and does not create an attorney-client relationship.',
    translationNote:
      'Machine translation. It may be inexact. Do not rely on it for legal decisions; confirm important points with the attorney.',
    reviewReplyWarning:
      'Your reply is public. Do not reveal confidential client information, even if the client posted it first. Keep the reply short, factual and respectful.',
    sponsoredLabel: 'Sponsored',
  },
  ru: {
    attorneyAdvertisingLabel: 'Реклама адвоката',
    priorResultsDisclaimer:
      'Прежние результаты не гарантируют такого же исхода. Каждое дело уникально.',
    badgeExplainer:
      'Значок показывает, что проверил LawBid, например что номер лицензии совпал с реестром коллегии адвокатов штата на определённую дату. Это не рекомендация, не рейтинг и не мнение о качестве работы адвоката. Перед наймом проверьте адвоката сами.',
    bestAnswerNote:
      'Этот ответ выбрал автор вопроса. Это общая информация, а не юридическая консультация, и она не создаёт отношений «адвокат — клиент».',
    translationNote:
      'Машинный перевод, возможны неточности. Не принимайте по нему юридических решений; важное уточняйте у адвоката.',
    reviewReplyWarning:
      'Ваш ответ публичный. Не раскрывайте конфиденциальные сведения о клиенте, даже если клиент написал о них первым. Отвечайте коротко, по фактам и уважительно.',
    sponsoredLabel: 'Реклама',
  },
  es: {
    attorneyAdvertisingLabel: 'Publicidad de abogados',
    priorResultsDisclaimer:
      'Los resultados anteriores no garantizan un resultado similar. Cada caso es diferente.',
    badgeExplainer:
      'Una insignia muestra lo que LawBid comprobó, por ejemplo que un número de licencia coincidía con el registro del colegio de abogados del estado en una fecha determinada. No es una recomendación, una clasificación ni una opinión sobre la calidad de un abogado. Compruebe usted mismo al abogado antes de contratarlo.',
    bestAnswerNote:
      'La persona que hizo la pregunta eligió esta respuesta. Es información general, no asesoramiento jurídico, y no crea una relación abogado-cliente.',
    translationNote:
      'Traducción automática. Puede ser inexacta. No la use para decisiones legales; confirme los puntos importantes con el abogado.',
    reviewReplyWarning:
      'Su respuesta es pública. No revele información confidencial del cliente, aunque el cliente la haya publicado primero. Mantenga la respuesta breve, objetiva y respetuosa.',
    sponsoredLabel: 'Patrocinado',
  },
  fr: {
    attorneyAdvertisingLabel: 'Publicité d’avocat',
    priorResultsDisclaimer:
      'Les résultats antérieurs ne garantissent pas un résultat similaire. Chaque affaire est différente.',
    badgeExplainer:
      'Un badge indique ce que LawBid a vérifié, par exemple qu’un numéro de licence correspondait au registre du barreau de l’État à une date donnée. Ce n’est ni une recommandation, ni un classement, ni un avis sur la qualité d’un avocat. Vérifiez vous-même l’avocat avant de l’engager.',
    bestAnswerNote:
      'La personne qui a posé la question a choisi cette réponse. Il s’agit d’une information générale, pas d’un conseil juridique, et elle ne crée pas de relation avocat-client.',
    translationNote:
      'Traduction automatique, parfois inexacte. Ne vous y fiez pas pour des décisions juridiques ; confirmez les points importants avec l’avocat.',
    reviewReplyWarning:
      'Votre réponse est publique. Ne divulguez pas d’informations confidentielles sur le client, même si le client les a publiées en premier. Restez bref, factuel et respectueux.',
    sponsoredLabel: 'Sponsorisé',
  },
  de: {
    attorneyAdvertisingLabel: 'Anwaltswerbung',
    priorResultsDisclaimer:
      'Frühere Ergebnisse garantieren kein ähnliches Ergebnis. Jeder Fall ist anders.',
    badgeExplainer:
      'Ein Abzeichen zeigt, was LawBid geprüft hat, zum Beispiel dass eine Lizenznummer an einem bestimmten Datum mit dem Register der Anwaltskammer des Bundesstaats übereinstimmte. Es ist keine Empfehlung, kein Ranking und keine Meinung zur Qualität eines Anwalts. Prüfen Sie den Anwalt vor der Beauftragung selbst.',
    bestAnswerNote:
      'Die Person, die die Frage gestellt hat, hat diese Antwort gewählt. Sie ist eine allgemeine Information, keine Rechtsberatung und begründet kein Mandatsverhältnis.',
    translationNote:
      'Maschinelle Übersetzung, möglicherweise ungenau. Treffen Sie darauf keine rechtlichen Entscheidungen; klären Sie wichtige Punkte mit dem Anwalt.',
    reviewReplyWarning:
      'Ihre Antwort ist öffentlich. Geben Sie keine vertraulichen Mandanteninformationen preis, auch wenn der Mandant sie zuerst veröffentlicht hat. Antworten Sie kurz, sachlich und respektvoll.',
    sponsoredLabel: 'Gesponsert',
  },
  it: {
    attorneyAdvertisingLabel: 'Pubblicità di avvocati',
    priorResultsDisclaimer:
      'I risultati precedenti non garantiscono un esito simile. Ogni caso è diverso.',
    badgeExplainer:
      'Un badge mostra ciò che LawBid ha verificato, ad esempio che un numero di licenza corrispondeva al registro dell’ordine degli avvocati dello Stato in una certa data. Non è una raccomandazione, una classifica né un parere sulla qualità di un avvocato. Verifichi lei stesso l’avvocato prima di incaricarlo.',
    bestAnswerNote:
      'La persona che ha posto la domanda ha scelto questa risposta. È un’informazione generale, non una consulenza legale, e non crea un rapporto avvocato-cliente.',
    translationNote:
      'Traduzione automatica, può essere inesatta. Non basare decisioni legali su di essa; conferma i punti importanti con l’avvocato.',
    reviewReplyWarning:
      'La tua risposta è pubblica. Non rivelare informazioni riservate del cliente, anche se è stato il cliente a pubblicarle per primo. Rispondi in modo breve, fattuale e rispettoso.',
    sponsoredLabel: 'Sponsorizzato',
  },
  pt: {
    attorneyAdvertisingLabel: 'Publicidade de advogados',
    priorResultsDisclaimer:
      'Resultados anteriores não garantem um resultado semelhante. Cada caso é diferente.',
    badgeExplainer:
      'Um selo mostra o que a LawBid verificou, por exemplo que um número de licença coincidia com o registro da ordem dos advogados do estado numa determinada data. Não é uma recomendação, um ranking nem uma opinião sobre a qualidade de um advogado. Verifique o advogado por conta própria antes de contratá-lo.',
    bestAnswerNote:
      'A pessoa que fez a pergunta escolheu esta resposta. É informação geral, não aconselhamento jurídico, e não cria uma relação advogado-cliente.',
    translationNote:
      'Tradução automática, pode ser imprecisa. Não a use para decisões jurídicas; confirme os pontos importantes com o advogado.',
    reviewReplyWarning:
      'Sua resposta é pública. Não revele informações confidenciais do cliente, mesmo que o cliente as tenha publicado primeiro. Responda de forma breve, factual e respeitosa.',
    sponsoredLabel: 'Patrocinado',
  },
  nl: {
    attorneyAdvertisingLabel: 'Advocatenreclame',
    priorResultsDisclaimer:
      'Eerdere resultaten garanderen geen vergelijkbare uitkomst. Elke zaak is anders.',
    badgeExplainer:
      'Een badge laat zien wat LawBid heeft gecontroleerd, bijvoorbeeld dat een licentienummer op een bepaalde datum overeenkwam met het register van de advocatenorde van de staat. Het is geen aanbeveling, ranglijst of oordeel over de kwaliteit van een advocaat. Controleer de advocaat zelf voordat u hem inhuurt.',
    bestAnswerNote:
      'De persoon die de vraag stelde, koos dit antwoord. Het is algemene informatie, geen juridisch advies, en leidt niet tot een relatie tussen advocaat en cliënt.',
    translationNote:
      'Automatische vertaling, kan onnauwkeurig zijn. Neem er geen juridische beslissingen op; bevestig belangrijke punten bij de advocaat.',
    reviewReplyWarning:
      'Uw reactie is openbaar. Geef geen vertrouwelijke informatie over de cliënt prijs, ook niet als de cliënt die zelf eerst plaatste. Houd de reactie kort, feitelijk en respectvol.',
    sponsoredLabel: 'Gesponsord',
  },
  pl: {
    attorneyAdvertisingLabel: 'Reklama prawnika',
    priorResultsDisclaimer:
      'Wcześniejsze wyniki nie gwarantują podobnego rezultatu. Każda sprawa jest inna.',
    badgeExplainer:
      'Odznaka pokazuje, co sprawdził LawBid, na przykład że numer licencji zgadzał się z rejestrem izby adwokackiej stanu w danym dniu. To nie jest rekomendacja, ranking ani opinia o jakości pracy prawnika. Sprawdź prawnika samodzielnie przed zatrudnieniem.',
    bestAnswerNote:
      'Tę odpowiedź wybrała osoba, która zadała pytanie. To informacja ogólna, a nie porada prawna, i nie tworzy relacji prawnik–klient.',
    translationNote:
      'Tłumaczenie maszynowe, może być niedokładne. Nie podejmuj na jego podstawie decyzji prawnych; ważne kwestie potwierdź z prawnikiem.',
    reviewReplyWarning:
      'Twoja odpowiedź jest publiczna. Nie ujawniaj poufnych informacji o kliencie, nawet jeśli klient opublikował je pierwszy. Odpowiadaj krótko, rzeczowo i uprzejmie.',
    sponsoredLabel: 'Sponsorowane',
  },
  uk: {
    attorneyAdvertisingLabel: 'Реклама адвоката',
    priorResultsDisclaimer:
      'Попередні результати не гарантують подібного підсумку. Кожна справа унікальна.',
    badgeExplainer:
      'Значок показує, що перевірив LawBid, наприклад що номер ліцензії збігся з реєстром колегії адвокатів штату на певну дату. Це не рекомендація, не рейтинг і не думка про якість роботи адвоката. Перед наймом перевірте адвоката самі.',
    bestAnswerNote:
      'Цю відповідь обрав автор запитання. Це загальна інформація, а не юридична консультація, і вона не створює відносин «адвокат — клієнт».',
    translationNote:
      'Машинний переклад, можливі неточності. Не ухвалюйте за ним юридичних рішень; важливе уточнюйте в адвоката.',
    reviewReplyWarning:
      'Ваша відповідь публічна. Не розкривайте конфіденційні відомості про клієнта, навіть якщо клієнт написав про них першим. Відповідайте коротко, за фактами та шанобливо.',
    sponsoredLabel: 'Реклама',
  },
};

/** The four older short strings for the eight machine-translated languages
 * (en / ru stay in legal.settings.ts). partnerTerms (the long rules) falls
 * back to the English text for these languages until the owner translates
 * it. */
export const OLD_TEXTS_MACHINE: Record<
  Exclude<LegalLang, 'en' | 'ru'>,
  {
    caseCreate: string;
    attorneyUnverified: string;
    supportNote: string;
    partnerDisclosure: string;
  }
> = {
  es: {
    caseCreate:
      'LawBid no es un bufete de abogados y no ofrece asesoramiento jurídico. Los abogados que responden son independientes. No publique nada que deba seguir siendo confidencial: comparta los detalles en el chat con el abogado que elija.',
    attorneyUnverified:
      'La licencia de este abogado es declarada por él mismo y LawBid no la ha comprobado. Verifíquela en el colegio de abogados del estado antes de contratar (el enlace al registro está en la hoja del nivel de confianza).',
    supportNote:
      'Nuestro equipo no puede dar asesoramiento jurídico ni recomendar abogados. Para dudas legales, publique un caso y los abogados responderán.',
    partnerDisclosure:
      'Cuando hable de LawBid a cambio de una recompensa, debe decirlo claramente en cada publicación, vídeo o mensaje (por ejemplo “#ad” o “enlace de socio”). Lo exigen las Guías de Endorsement de la FTC.',
  },
  fr: {
    caseCreate:
      'LawBid n’est pas un cabinet d’avocats et ne donne pas de conseils juridiques. Les avocats qui répondent sont indépendants. Ne publiez rien qui doive rester confidentiel : donnez les détails dans le chat avec l’avocat que vous choisissez.',
    attorneyUnverified:
      'La licence de cet avocat est déclarée par lui-même et n’a pas été vérifiée par LawBid. Vérifiez-la auprès du barreau de l’État avant de l’engager (le lien du registre figure dans la fiche du niveau de confiance).',
    supportNote:
      'Notre équipe ne peut ni donner de conseils juridiques ni recommander d’avocat. Pour une question juridique, publiez une affaire et les avocats répondront.',
    partnerDisclosure:
      'Lorsque vous parlez de LawBid contre une récompense, vous devez l’indiquer clairement dans chaque publication, vidéo ou message (par exemple « #ad » ou « lien partenaire »). C’est exigé par les Endorsement Guides de la FTC.',
  },
  de: {
    caseCreate:
      'LawBid ist keine Anwaltskanzlei und gibt keine Rechtsberatung. Die antwortenden Anwälte sind unabhängig. Veröffentlichen Sie nichts, was vertraulich bleiben muss: Teilen Sie Details im Chat mit dem Anwalt Ihrer Wahl.',
    attorneyUnverified:
      'Die Lizenz dieses Anwalts ist eine Selbstangabe und wurde von LawBid nicht geprüft. Prüfen Sie sie vor der Beauftragung bei der Anwaltskammer des Bundesstaats (der Registerlink steht im Vertrauensstufen-Fenster).',
    supportNote:
      'Unser Team kann keine Rechtsberatung geben und keine Anwälte empfehlen. Stellen Sie bei Rechtsfragen einen Fall ein, Anwälte antworten.',
    partnerDisclosure:
      'Wenn Sie gegen eine Belohnung über LawBid sprechen, müssen Sie das in jedem Beitrag, Video oder jeder Nachricht klar sagen (zum Beispiel „#ad“ oder „Partnerlink“). Das verlangen die Endorsement Guides der FTC.',
  },
  it: {
    caseCreate:
      'LawBid non è uno studio legale e non fornisce consulenza legale. Gli avvocati che rispondono sono indipendenti. Non pubblicare nulla che debba restare riservato: condividi i dettagli nella chat con l’avvocato che scegli.',
    attorneyUnverified:
      'La licenza di questo avvocato è dichiarata da lui stesso e non è stata verificata da LawBid. Verificala presso l’ordine degli avvocati dello Stato prima di incaricarlo (il link al registro è nella scheda del livello di fiducia).',
    supportNote:
      'Il nostro team non può dare consulenza legale né consigliare avvocati. Per domande legali, pubblica un caso e gli avvocati risponderanno.',
    partnerDisclosure:
      'Quando parli di LawBid in cambio di un compenso devi dirlo chiaramente in ogni post, video o messaggio (ad esempio “#ad” o “link partner”). Lo richiedono le Endorsement Guides della FTC.',
  },
  pt: {
    caseCreate:
      'A LawBid não é um escritório de advocacia e não presta aconselhamento jurídico. Os advogados que respondem são independentes. Não publique nada que deva permanecer confidencial: compartilhe os detalhes no chat com o advogado que escolher.',
    attorneyUnverified:
      'A licença deste advogado é autodeclarada e não foi verificada pela LawBid. Verifique-a na ordem dos advogados do estado antes de contratar (o link do registro está na folha do nível de confiança).',
    supportNote:
      'Nossa equipe não pode dar aconselhamento jurídico nem indicar advogados. Para dúvidas jurídicas, publique um caso e os advogados responderão.',
    partnerDisclosure:
      'Ao falar da LawBid em troca de uma recompensa, você deve dizer isso claramente em cada publicação, vídeo ou mensagem (por exemplo “#ad” ou “link de parceiro”). Isso é exigido pelos Endorsement Guides da FTC.',
  },
  nl: {
    caseCreate:
      'LawBid is geen advocatenkantoor en geeft geen juridisch advies. De advocaten die reageren zijn onafhankelijk. Plaats niets wat vertrouwelijk moet blijven: deel details in de chat met de advocaat die u kiest.',
    attorneyUnverified:
      'De licentie van deze advocaat is zelf opgegeven en niet door LawBid gecontroleerd. Controleer die bij de advocatenorde van de staat voordat u hem inhuurt (de registerlink staat in het venster met het vertrouwensniveau).',
    supportNote:
      'Ons team kan geen juridisch advies geven en geen advocaat aanbevelen. Plaats voor juridische vragen een zaak en advocaten antwoorden.',
    partnerDisclosure:
      'Als u tegen een beloning over LawBid vertelt, moet u dat in elke post, video of elk bericht duidelijk zeggen (bijvoorbeeld “#ad” of “partnerlink”). Dat eisen de Endorsement Guides van de FTC.',
  },
  pl: {
    caseCreate:
      'LawBid nie jest kancelarią prawną i nie udziela porad prawnych. Prawnicy, którzy odpowiadają, są niezależni. Nie publikuj niczego, co musi pozostać poufne: szczegóły podaj na czacie z wybranym prawnikiem.',
    attorneyUnverified:
      'Licencja tego prawnika jest jego własnym oświadczeniem i nie została sprawdzona przez LawBid. Zweryfikuj ją w izbie adwokackiej stanu przed zatrudnieniem (link do rejestru jest w oknie poziomu zaufania).',
    supportNote:
      'Nasz zespół nie udziela porad prawnych ani nie poleca prawników. W sprawach prawnych opublikuj sprawę, a prawnicy odpowiedzą.',
    partnerDisclosure:
      'Gdy mówisz o LawBid za nagrodę, musisz to wyraźnie zaznaczyć w każdym poście, filmie lub wiadomości (na przykład „#ad” lub „link partnerski”). Wymagają tego wytyczne FTC (Endorsement Guides).',
  },
  uk: {
    caseCreate:
      'LawBid не юридична фірма і не надає юридичних порад. Адвокати, які відповідають, працюють незалежно. Не публікуйте те, що має залишитися конфіденційним: подробиці повідомляйте в чаті обраному адвокату.',
    attorneyUnverified:
      'Ліцензію цього адвоката вказав він сам, LawBid її не перевіряв. Перед наймом перевірте її в колегії адвокатів штату (посилання на реєстр — у вікні рівня довіри).',
    supportNote:
      'Наша команда не надає юридичних порад і не рекомендує адвокатів. З юридичних питань створіть справу — адвокати відповідять.',
    partnerDisclosure:
      'Якщо ви розповідаєте про LawBid за винагороду, чітко повідомляйте про це в кожному дописі, відео чи повідомленні (наприклад, «#реклама» або «партнерське посилання»). Цього вимагають правила FTC про рекомендації.',
  },
};
