// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-21 (inbox 29/30): «Счётчик на иконке в меню» and a switch
// per kind of notification — merged into StaticTranslatorRu/En. All 85
// languages are in apps/api/prisma/seed/translations_seed.xlsx.

const notifPrefsRu = <String, String>{
  'notif.iconBadge': 'Счётчик на иконке в меню',
  'notif.iconBadge.hint':
      'Число непрочитанных на иконке приложения на главном экране',
  'notif.block.chats': 'Чаты, группы и каналы',
  'notif.block.assistants': 'Помощники',
  'notif.topic.chatMentions': 'Упоминания в группах',
  'notif.topic.likes': 'Лайки',
  'notif.topic.comments': 'Комментарии',
  'notif.topic.replies': 'Ответы на комментарии',
  'notif.topic.followers': 'Новые подписчики',
  'notif.topic.mentions': 'Упоминания @',
  'notif.topic.reactions': 'Реакции',
  'notif.topic.following': 'Посты подписок',
  'notif.topic.bidNew': 'Новые биды и приглашения',
  'notif.topic.bidDecision': 'Бид принят, отклонён или встречное предложение',
  'notif.topic.caseMessages': 'Сообщения по кейсу',
  'notif.topic.caseDeadlines': 'Сроки и дедлайны',
  'notif.topic.casePayments': 'Платежи по кейсам',
  'notif.topic.caseUpdates': 'Статус кейса и отзывы',
  'notif.topic.tasks': 'Задачи и планер',
  'notif.topic.assistants': 'Уведомления от помощников',
  'notif.topic.assistantMessages': 'Сообщения и запросы',
  'notif.topic.security': 'Безопасность, платежи, подписка и модерация',
  'notif.topic.account': 'Аккаунт, верификация и экспорт данных',
  'notif.topic.partner': 'Бонусы и партнёрская программа',
  'notif.topic.news': 'Новости LawBid',
  'notif.list.assistant_bid_draft': 'Помощник подготовил черновик бида',
  'notification.assistant_bid_draft': 'Черновик бида от помощника',
  'notif.bids.assistant_bid_draft.title': 'Черновик бида готов',
  'notif.bids.assistant_bid_draft.body':
      'Помощник подготовил бид. Проверьте и отправьте.',
};

const notifPrefsEn = <String, String>{
  'notif.iconBadge': 'Badge counter on the app icon',
  'notif.iconBadge.hint':
      'The unread number on the app icon on your home screen',
  'notif.block.chats': 'Chats, groups and channels',
  'notif.block.assistants': 'Assistants',
  'notif.topic.chatMentions': 'Mentions in groups',
  'notif.topic.likes': 'Likes',
  'notif.topic.comments': 'Comments',
  'notif.topic.replies': 'Replies to comments',
  'notif.topic.followers': 'New followers',
  'notif.topic.mentions': '@ mentions',
  'notif.topic.reactions': 'Reactions',
  'notif.topic.following': 'Posts from people you follow',
  'notif.topic.bidNew': 'New bids and invitations',
  'notif.topic.bidDecision': 'Bid accepted, declined or countered',
  'notif.topic.caseMessages': 'Case messages',
  'notif.topic.caseDeadlines': 'Dates and deadlines',
  'notif.topic.casePayments': 'Case payments',
  'notif.topic.caseUpdates': 'Case status and reviews',
  'notif.topic.tasks': 'Tasks and planner',
  'notif.topic.assistants': 'Notifications from assistants',
  'notif.topic.assistantMessages': 'Messages and requests',
  'notif.topic.security': 'Security, payments, subscription and moderation',
  'notif.topic.account': 'Account, verification and data export',
  'notif.topic.partner': 'Rewards and partner program',
  'notif.topic.news': 'LawBid news',
  'notif.list.assistant_bid_draft': 'Your assistant prepared a bid draft',
  'notification.assistant_bid_draft': 'Bid draft from your assistant',
  'notif.bids.assistant_bid_draft.title': 'Bid draft ready',
  'notif.bids.assistant_bid_draft.body':
      'Your assistant prepared a bid. Check it and send.',
};
