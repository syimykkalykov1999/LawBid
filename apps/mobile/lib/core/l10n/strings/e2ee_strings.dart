// ignore_for_file: lines_longer_than_80_chars
// Item 25 (end-to-end encrypted chats): the encryption screens, the
// encrypted backup and the «security code changed» line — compiled-in
// strings merged into StaticTranslatorRu/En.
// Other languages: the translations seed (scripts/i18n-add.mjs).

const e2eeRu = <String, String>{
  'chat.e2ee.backupCreate': 'Создать копию',
  'chat.e2ee.backupDone': 'Копия готова. Сообщений: {count}',
  'chat.e2ee.backupEnterKey': 'Введите 64-значный ключ',
  'chat.e2ee.backupHint':
      'Ваши сообщения с этого устройства, закрытые 64-значным ключом, который есть только у вас. LawBid не может прочитать копию.',
  'chat.e2ee.backupKeyHint':
      'Сохраните этот ключ. Без него копию не восстановить.',
  'chat.e2ee.backupLast': 'Последняя копия: {date}',
  'chat.e2ee.backupNewKey': 'Новый ключ',
  'chat.e2ee.backupNone': 'Копии ещё нет',
  'chat.e2ee.backupRestore': 'Восстановить',
  'chat.e2ee.backupRestored': 'Восстановлено. Сообщений: {count}',
  'chat.e2ee.backupSaved': 'Я сохранил ключ',
  'chat.e2ee.backupTitle': 'Зашифрованная резервная копия',
  'chat.e2ee.backupWrongKey': 'Этот ключ не открывает копию',
  'chat.e2ee.encryption': 'Шифрование',
  'chat.e2ee.encryptionHint':
      'Сообщения защищены сквозным шифрованием. Нажмите, чтобы проверить.',
  'chat.e2ee.notice':
      'Сообщения защищены сквозным шифрованием. Никто вне этого чата, даже LawBid, не может их прочитать. Нажмите, чтобы узнать подробнее.',
  'chat.e2ee.theOther': 'собеседник',
  'chat.e2ee.verifyHint':
      'Чтобы убедиться, что сообщения с {name} защищены сквозным шифрованием, сравните эти цифры с цифрами на его устройстве или отсканируйте его код.',
  'chat.e2ee.verifyMatch': 'Коды совпадают.',
  'chat.e2ee.verifyMismatch': 'Коды не совпадают.',
  'chat.e2ee.verifyScan': 'Сканировать код',
  'chat.e2ee.verifyTitle': 'Код безопасности',
  'chat.e2ee.verifyUnavailable':
      'Код появится, когда в этом чате включится сквозное шифрование.',
  'chat.e2ee.waiting': 'Ожидание сообщения. Это может занять некоторое время.',
  'chat.system.e2eeCodeChanged': 'Код безопасности в этом чате изменился',
};

const e2eeEn = <String, String>{
  'chat.e2ee.backupCreate': 'Back up now',
  'chat.e2ee.backupDone': 'Backup done. Messages: {count}',
  'chat.e2ee.backupEnterKey': 'Enter the 64-digit key',
  'chat.e2ee.backupHint':
      "Your messages from this device, locked with a 64-digit key only you have. LawBid can't read the backup.",
  'chat.e2ee.backupKeyHint':
      "Save this key. Without it the backup can't be restored.",
  'chat.e2ee.backupLast': 'Last backup: {date}',
  'chat.e2ee.backupNewKey': 'New key',
  'chat.e2ee.backupNone': 'No backup yet',
  'chat.e2ee.backupRestore': 'Restore',
  'chat.e2ee.backupRestored': 'Restored. Messages: {count}',
  'chat.e2ee.backupSaved': 'I saved the key',
  'chat.e2ee.backupTitle': 'Encrypted backup',
  'chat.e2ee.backupWrongKey': "This key doesn't open the backup",
  'chat.e2ee.encryption': 'Encryption',
  'chat.e2ee.encryptionHint':
      'Messages are end-to-end encrypted. Tap to verify.',
  'chat.e2ee.notice':
      'Messages are end-to-end encrypted. No one outside this chat, not even LawBid, can read them. Tap to learn more.',
  'chat.e2ee.theOther': 'the other person',
  'chat.e2ee.verifyHint':
      'To verify that messages with {name} are end-to-end encrypted, compare these numbers with the ones on their device or scan their code.',
  'chat.e2ee.verifyMatch': 'The codes match.',
  'chat.e2ee.verifyMismatch': 'The codes do not match.',
  'chat.e2ee.verifyScan': 'Scan code',
  'chat.e2ee.verifyTitle': 'Security code',
  'chat.e2ee.verifyUnavailable':
      'The code appears once this chat is end-to-end encrypted.',
  'chat.e2ee.waiting': 'Waiting for this message. This may take a while.',
  'chat.system.e2eeCodeChanged': 'The security code in this chat changed',
};
