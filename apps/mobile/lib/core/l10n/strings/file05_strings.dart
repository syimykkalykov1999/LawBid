// docs/05 (feed, posts, comments, follows, search, chats, notifications)
// compiled-in strings, merged into StaticTranslatorRu/En (the seed and
// fallback layer of L10nTranslator). Plurals: `.one/.few/.many/.other`
// for Russian, `.one/.other` for English.

const file05Ru = <String, String>{
  // --- relative time ---
  'time.justNow': 'только что',
  'time.minutesAgo.one': '{count} мин назад',
  'time.minutesAgo.few': '{count} мин назад',
  'time.minutesAgo.many': '{count} мин назад',
  'time.minutesAgo.other': '{count} мин назад',
  'time.hoursAgo.one': '{count} ч назад',
  'time.hoursAgo.few': '{count} ч назад',
  'time.hoursAgo.many': '{count} ч назад',
  'time.hoursAgo.other': '{count} ч назад',
  'time.daysAgo.one': '{count} день назад',
  'time.daysAgo.few': '{count} дня назад',
  'time.daysAgo.many': '{count} дней назад',
  'time.daysAgo.other': '{count} дня назад',

  // --- post card / screen ---
  'post.title': 'Пост',
  'post.media.label': 'Фото поста. Двойное нажатие — нравится',
  'post.author.open': 'Открыть профиль {name}',
  'post.verified': 'Проверенный адвокат',
  'post.menu': 'Действия с постом',
  'post.menu.edit': 'Редактировать текст',
  'post.menu.delete': 'Удалить',
  'post.menu.report': 'Пожаловаться',
  'post.menu.copyLink': 'Копировать ссылку',
  'post.linkCopied': 'Ссылка скопирована',
  'post.like': 'Нравится',
  'post.unlike': 'Убрать отметку «Нравится»',
  'post.save': 'Сохранить',
  'post.unsave': 'Убрать из сохранённого',
  'post.comments': 'Комментарии',
  'post.share': 'Поделиться',
  'post.likes.one': '{count} отметка «Нравится»',
  'post.likes.few': '{count} отметки «Нравится»',
  'post.likes.many': '{count} отметок «Нравится»',
  'post.likes.other': '{count} отметки «Нравится»',
  'post.more': 'ещё',
  'post.edited': 'Изменено',
  'post.viewComments': 'Посмотреть все комментарии ({count})',
  'post.open': 'Открыть пост',
  'post.unavailable': 'Пост недоступен',
  'post.disclaimer':
      'Материалы носят информационный характер и не являются юридической консультацией',
  'post.delete.title': 'Удалить пост?',
  'post.delete.message':
      'Пост исчезнет из ленты, профиля и поиска. Отменить удаление нельзя.',
  'post.deleted': 'Пост удалён',
  'post.published': 'Пост опубликован',

  // --- composer ---
  'post.create.title': 'Пост в ленту',
  'post.create.hint': 'Поделитесь знаниями, разбором кейса или советом…',
  'post.create.photos': 'Фото',
  'post.create.addPhoto': 'Добавить фото',
  'post.create.removePhoto': 'Убрать фото',
  'post.create.reorderHint': 'Удерживайте фото, чтобы изменить порядок',
  'post.create.publish': 'Опубликовать',

  // --- comments ---
  'comment.hint': 'Добавьте комментарий…',
  'comment.send': 'Отправить комментарий',
  'comment.reply': 'Ответить',
  'comment.replyingTo': 'Ответ для {name}',
  'comment.showReplies': 'Показать ответы ({count})',
  'comment.hideReplies': 'Скрыть ответы',
  'comment.moreReplies': 'Ещё ответы',
  'comment.empty': 'Комментариев пока нет. Станьте первым.',
  'comment.delete': 'Удалить комментарий',
  'comment.delete.title': 'Удалить комментарий?',
  'comment.delete.message': 'Вместе с ним удалятся ответы на него.',

  // --- reports ---
  'report.title': 'Почему вы жалуетесь?',
  'report.reason.spam': 'Спам',
  'report.reason.abuse': 'Оскорбления или травля',
  'report.reason.misinformation': 'Недостоверная информация',
  'report.reason.impersonation': 'Выдаёт себя за другого',
  'report.reason.inappropriate': 'Неприемлемый контент',
  'report.reason.other': 'Другое',
  'report.sent': 'Спасибо. Мы проверим жалобу.',

  // --- follows ---
  'follow.follow': 'Подписаться',
  'follow.following': 'Вы подписаны',
  'follow.followers': 'Подписчики',
  'follow.followingList': 'Подписки',
  'follow.followers.empty': 'Подписчиков-адвокатов пока нет',
  'follow.following.empty': 'Подписок пока нет',
  'suggestions.title': 'Рекомендуемые адвокаты',

  // --- tags ---
  'tag.top': 'Топ',
  'tag.new': 'Новые',
  'tag.empty': 'Постов с этой темой пока нет',

  // --- Моё ---
  'mine.saved.cases': 'Кейсы',
  'mine.saved.posts': 'Посты',
};

const file05En = <String, String>{
  // --- relative time ---
  'time.justNow': 'just now',
  'time.minutesAgo.one': '{count} min ago',
  'time.minutesAgo.other': '{count} min ago',
  'time.hoursAgo.one': '{count} h ago',
  'time.hoursAgo.other': '{count} h ago',
  'time.daysAgo.one': '{count} day ago',
  'time.daysAgo.other': '{count} days ago',

  // --- post card / screen ---
  'post.title': 'Post',
  'post.media.label': 'Post photos. Double tap to like',
  'post.author.open': 'Open the profile of {name}',
  'post.verified': 'Verified attorney',
  'post.menu': 'Post actions',
  'post.menu.edit': 'Edit text',
  'post.menu.delete': 'Delete',
  'post.menu.report': 'Report',
  'post.menu.copyLink': 'Copy link',
  'post.linkCopied': 'Link copied',
  'post.like': 'Like',
  'post.unlike': 'Unlike',
  'post.save': 'Save',
  'post.unsave': 'Remove from saved',
  'post.comments': 'Comments',
  'post.share': 'Share',
  'post.likes.one': '{count} like',
  'post.likes.other': '{count} likes',
  'post.more': 'more',
  'post.edited': 'Edited',
  'post.viewComments': 'View all comments ({count})',
  'post.open': 'Open post',
  'post.unavailable': 'Post unavailable',
  'post.disclaimer':
      'For information only; this is not legal advice',
  'post.delete.title': 'Delete this post?',
  'post.delete.message':
      'It will disappear from the feed, your profile and search. This can’t be undone.',
  'post.deleted': 'Post deleted',
  'post.published': 'Post published',

  // --- composer ---
  'post.create.title': 'New post',
  'post.create.hint': 'Share insight, a case breakdown or a tip…',
  'post.create.photos': 'Photos',
  'post.create.addPhoto': 'Add photo',
  'post.create.removePhoto': 'Remove photo',
  'post.create.reorderHint': 'Press and hold a photo to reorder',
  'post.create.publish': 'Publish',

  // --- comments ---
  'comment.hint': 'Add a comment…',
  'comment.send': 'Send comment',
  'comment.reply': 'Reply',
  'comment.replyingTo': 'Replying to {name}',
  'comment.showReplies': 'View replies ({count})',
  'comment.hideReplies': 'Hide replies',
  'comment.moreReplies': 'More replies',
  'comment.empty': 'No comments yet. Be the first.',
  'comment.delete': 'Delete comment',
  'comment.delete.title': 'Delete this comment?',
  'comment.delete.message': 'Its replies will be deleted too.',

  // --- reports ---
  'report.title': 'Why are you reporting this?',
  'report.reason.spam': 'Spam',
  'report.reason.abuse': 'Harassment or abuse',
  'report.reason.misinformation': 'False information',
  'report.reason.impersonation': 'Impersonation',
  'report.reason.inappropriate': 'Inappropriate content',
  'report.reason.other': 'Something else',
  'report.sent': 'Thanks. We’ll review your report.',

  // --- follows ---
  'follow.follow': 'Follow',
  'follow.following': 'Following',
  'follow.followers': 'Followers',
  'follow.followingList': 'Following',
  'follow.followers.empty': 'No attorney followers yet',
  'follow.following.empty': 'Not following anyone yet',
  'suggestions.title': 'Suggested attorneys',

  // --- tags ---
  'tag.top': 'Top',
  'tag.new': 'New',
  'tag.empty': 'No posts on this topic yet',

  // --- My ---
  'mine.saved.cases': 'Cases',
  'mine.saved.posts': 'Posts',
};
