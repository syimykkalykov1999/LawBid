// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-22 (client economy plan §5.2, Telegram «Данные и память»):
// the storage screen — compiled-in strings merged into StaticTranslatorRu/En.
// Other languages: the seed file translations_seed.xlsx (scripts/i18n-add.mjs).

const storageScreenRu = <String, String>{
  'settings.storage.title': 'Данные и память',
  'settings.storage.hint': 'Кэш, медиа чатов и трафик',
  'storage.measuring': 'Считаем…',
  'storage.cat.images': 'Фото',
  'storage.cat.chat_media': 'Медиа чатов',
  'storage.cat.video': 'Видео',
  'storage.cat.other': 'Прочее',
  'storage.clear.row': 'Очистить',
  'storage.clear.confirm.title': 'Очистить кэш?',
  'storage.clear.confirm.body': 'Фото и файлы загрузятся заново при открытии.',
  'storage.clear.messages.body':
      'История чатов на этом телефоне будет стёрта и докачается при открытии чата.',
  'storage.clear.done': 'Кэш очищен',
  'storage.keepMedia.3d': '3 дня',
  'storage.keepMedia.1w': '1 неделя',
  'storage.keepMedia.1m': '1 месяц',
  'storage.network.title': 'Сетевой трафик сегодня',
  'storage.network.requests': 'Запросов: {n}',
  'storage.network.bytes': 'Получено: {size}',
  'storage.network.notModified': 'Без изменений (304): {n}',
  'storage.network.local': 'Из памяти телефона: {n}',
  'storage.cat.documents': 'Документы и файлы кейсов',
  'storage.clear.allSize': 'Очистить весь кэш {size}',
  'storage.clear.selectedSize': 'Очистить выбранное {size}',
  'storage.clear.note':
      'Медиа остаются на сервере и загрузятся снова, когда вы их откроете.',
  'storage.autoDelete.title': 'Автоудаление закэшированных медиа',
  'storage.autoDelete.private_chats': 'Личные чаты',
  'storage.autoDelete.groups': 'Группы',
  'storage.autoDelete.feed': 'Лента, рилсы и каналы',
  'storage.autoDelete.never': 'Никогда',
  'storage.autoDelete.footer':
      'Медиа, которые вы не открывали дольше выбранного срока, удалятся с телефона. На сервере они остаются.',
  'storage.cap.title': 'Максимальный размер кэша',
  'storage.cap.none': 'Нет',
  'storage.cap.footer':
      'Когда лимит превышен, первыми удаляются медиа, которые не открывали дольше всего.',
};

const storageScreenEn = <String, String>{
  'settings.storage.title': 'Data and storage',
  'settings.storage.hint': 'Cache, chat media and traffic',
  'storage.measuring': 'Measuring…',
  'storage.cat.images': 'Photos',
  'storage.cat.chat_media': 'Chat media',
  'storage.cat.video': 'Video',
  'storage.cat.other': 'Other',
  'storage.clear.row': 'Clear',
  'storage.clear.confirm.title': 'Clear the cache?',
  'storage.clear.confirm.body':
      'Photos and files will be downloaded again when opened.',
  'storage.clear.messages.body':
      'Chat history on this phone will be erased and fetched again when a chat is opened.',
  'storage.clear.done': 'Cache cleared',
  'storage.keepMedia.3d': '3 days',
  'storage.keepMedia.1w': '1 week',
  'storage.keepMedia.1m': '1 month',
  'storage.network.title': 'Network today',
  'storage.network.requests': 'Requests: {n}',
  'storage.network.bytes': 'Received: {size}',
  'storage.network.notModified': 'Not modified (304): {n}',
  'storage.network.local': 'Served from the phone: {n}',
  'storage.cat.documents': 'Documents and case files',
  'storage.clear.allSize': 'Clear entire cache {size}',
  'storage.clear.selectedSize': 'Clear selected {size}',
  'storage.clear.note':
      'Media stays on the server and is downloaded again when you open it.',
  'storage.autoDelete.title': 'Auto-delete cached media',
  'storage.autoDelete.private_chats': 'Private chats',
  'storage.autoDelete.groups': 'Groups',
  'storage.autoDelete.feed': 'Feed, reels and channels',
  'storage.autoDelete.never': 'Never',
  'storage.autoDelete.footer':
      'Media you have not opened for longer than the chosen time is removed from this phone. It stays on the server.',
  'storage.cap.title': 'Maximum cache size',
  'storage.cap.none': 'No limit',
  'storage.cap.footer':
      'When the limit is passed, the media you have not opened for the longest time goes first.',
};
