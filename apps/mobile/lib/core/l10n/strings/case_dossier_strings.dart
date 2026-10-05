// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-05: the "dossier" indicator on case cards and the case
// page — how much the client has filled in and attached, and the rule
// that the files and contacts open only after acceptance. Merged into
// StaticTranslatorRu/En.

const caseDossierRu = <String, String>{
  'cases.dossier.title': 'Досье',
  'cases.dossier.score': '{n} из {total}',
  'cases.dossier.level.full': 'Подробный кейс',
  'cases.dossier.level.basic': 'Основное есть',
  'cases.dossier.level.thin': 'Мало данных',
  'cases.dossier.docs.one': '{count} документ',
  'cases.dossier.docs.few': '{count} документа',
  'cases.dossier.docs.many': '{count} документов',
  'cases.dossier.docs.other': '{count} документа',
  'cases.dossier.photos.one': '{count} фото',
  'cases.dossier.photos.few': '{count} фото',
  'cases.dossier.photos.many': '{count} фото',
  'cases.dossier.photos.other': '{count} фото',
  'cases.dossier.noFiles': 'Файлов нет',
  'cases.dossier.item.description': 'Подробное описание',
  'cases.dossier.item.city': 'Город',
  'cases.dossier.item.urgency': 'Срочность',
  'cases.dossier.item.budget': 'Бюджет',
  'cases.dossier.item.documents': 'Документы',
  'cases.dossier.item.photos': 'Фото',
  'cases.dossier.ruleShort':
      'Файлы и контакты клиента откроются, как только он примет ваш бид',
  'cases.dossier.ruleBid':
      'Все документы, фото и контакты клиента откроются вам, как только клиент примет ваш бид. До этого видно только, что именно он приложил.',
  'cases.dossier.ruleOffer':
      'Все документы, фото и контакты клиента откроются вам, как только вы примете это предложение. До этого видно только, что именно он приложил.',
  'cases.dossier.unlocked': 'Материалы клиента открыты вам',
  'cases.dossier.ruleOwner':
      'Адвокаты видят только, что и сколько вы приложили. Сами файлы и ваши контакты откроются адвокату, чей бид вы примете. Чем полнее досье, тем точнее биды.',
  'cases.dossier.addFiles': 'Добавить документы и фото',
  'cases.dossier.filesSaved': 'Файлы добавлены',
  'cases.dossier.filesFailed': 'Не удалось добавить файлы. Попробуйте ещё раз.',
  'cases.dossier.filesFull': 'Можно приложить не больше {max} файлов',
};

const caseDossierEn = <String, String>{
  'cases.dossier.title': 'Case file',
  'cases.dossier.score': '{n} of {total}',
  'cases.dossier.level.full': 'Detailed case',
  'cases.dossier.level.basic': 'The basics',
  'cases.dossier.level.thin': 'Little detail',
  'cases.dossier.docs.one': '{count} document',
  'cases.dossier.docs.few': '{count} documents',
  'cases.dossier.docs.many': '{count} documents',
  'cases.dossier.docs.other': '{count} documents',
  'cases.dossier.photos.one': '{count} photo',
  'cases.dossier.photos.few': '{count} photos',
  'cases.dossier.photos.many': '{count} photos',
  'cases.dossier.photos.other': '{count} photos',
  'cases.dossier.noFiles': 'No files',
  'cases.dossier.item.description': 'Detailed description',
  'cases.dossier.item.city': 'City',
  'cases.dossier.item.urgency': 'Urgency',
  'cases.dossier.item.budget': 'Budget',
  'cases.dossier.item.documents': 'Documents',
  'cases.dossier.item.photos': 'Photos',
  'cases.dossier.ruleShort':
      "The client's files and contacts open once they accept your bid",
  'cases.dossier.ruleBid':
      "All of the client's documents, photos and contacts open to you as soon as the client accepts your bid. Until then you only see what they attached.",
  'cases.dossier.ruleOffer':
      "All of the client's documents, photos and contacts open to you as soon as you accept this offer. Until then you only see what they attached.",
  'cases.dossier.unlocked': "The client's materials are open to you",
  'cases.dossier.ruleOwner':
      'Attorneys only see what and how much you attached. The files and your contacts open only to the attorney whose bid you accept. The fuller the case file, the more accurate the bids.',
  'cases.dossier.addFiles': 'Add documents and photos',
  'cases.dossier.filesSaved': 'Files added',
  'cases.dossier.filesFailed': "Couldn't add the files. Please try again.",
  'cases.dossier.filesFull': 'You can attach up to {max} files',
};
