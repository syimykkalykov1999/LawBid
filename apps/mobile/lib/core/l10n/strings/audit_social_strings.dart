// ignore_for_file: lines_longer_than_80_chars
// App logic audit 2026-10-04 (docs/app-logic-audit.md) — compiled-in
// strings merged into StaticTranslatorRu/En.

const auditSocialRu = <String, String>{
  'post.stats.title': 'Статистика публикации',
  'post.stats.likes': 'Нравится',
  'post.stats.comments': 'Комментарии',
  'post.stats.reposts': 'Репосты',
  'post.stats.soon':
      'Видно только вам. Подробная статистика по дням — просмотры, охват, сохранения и переходы в профиль — скоро появится здесь.',
  'post.toReel.title': 'Сделать рилс?',
  'post.toReel.message': 'В рилсе одно видео. Выбранные фото не сохранятся.',
  'post.toReel.confirm': 'К рилсу',
  'promote.completePayment': 'Завершить оплату',
  // Owner 2026-10-07: Threads-style reposts.
  'post.repost': 'Сделать репост',
  'post.unrepost': 'Отменить репост',
  'post.repostedBy': '{username} сделал(а) репост',
  'post.repostedByMe': 'Вы сделали репост',
  'post.repost.action': 'Репост',
  'post.reposters.title': 'Репосты',
  'post.reposters.empty': 'Пока никто не сделал репост.',
  'post.likers.empty': 'Пока нет отметок «Нравится».',
  'profile.tab.reposts': 'Репосты',
  'profile.reposts.empty.title': 'Репостов пока нет',
  'profile.reposts.empty.self':
      'Нажмите ↻ под публикацией, и она появится здесь.',
  'profile.reposts.empty.other': 'Этот пользователь пока ничего не репостил.',
  // Owner 2026-10-18: the attorney profile's briefs + reposts tab.
  'profile.tab.briefsReposts': 'Брифы и репосты',
  'profile.briefsReposts.empty.title': 'Пока нет брифов и репостов',
  'profile.briefsReposts.empty.self':
      'Здесь появятся ваши брифы и публикации, которые вы репостнули.',
  'profile.briefsReposts.empty.other':
      'Этот юрист пока не публиковал брифов и ничего не репостил.',
  'profile.briefsReposts.empty.otherUser':
      'Этот пользователь пока не публиковал брифов и ничего не репостил.',
  // Owner 2026-10-18: the profile's «Рилсы» tab (any role).
  'profile.tab.reels': 'Рилсы',
  'profile.reels.empty.title': 'Рилсов пока нет',
  'profile.reels.empty.self': 'Опубликуйте видео — оно появится здесь.',
  'profile.reels.empty.other': 'Здесь пока нет рилсов.',
  'error.api.REPOST_OWN_POST': 'Свой пост нельзя репостнуть.',
  'notif.list.post_repost': '{name} сделал(а) репост вашей публикации',
  // Owner 2026-10-18 (Instagram): comments on / off and the archive.
  'post.menu.commentsOff': 'Выключить комментарии',
  'post.menu.commentsOn': 'Включить комментарии',
  'post.comments.turnedOff': 'Комментарии выключены',
  'post.comments.turnedOn': 'Комментарии включены',
  'post.comments.off': 'Автор выключил комментарии',
  'post.menu.archive': 'Архивировать',
  'post.menu.unarchive': 'Показать в профиле',
  'post.archived': 'Пост перенесён в архив',
  'post.unarchived': 'Пост снова в профиле',
  'settings.archive': 'Архив',
  'settings.archive.hint': 'Архивированные публикации видите только вы',
  'archive.empty.title': 'В архиве пусто',
  'archive.empty.message':
      'Архивируйте публикацию в меню ⋯ — она пропадёт из профиля и лент, но сохранит лайки и комментарии.',
  'archive.post.note': 'В архиве — этот пост видите только вы',
  // Owner 2026-10-18: post insights (PostInsightsScreen).
  'post.insights.published': 'Опубликовано {date}',
  'post.insights.overview': 'Обзор',
  'post.insights.reach': 'Охваченные аккаунты',
  'post.insights.impressions': 'Показы',
  'post.insights.views': 'Просмотры',
  'post.insights.interactions': 'Взаимодействия',
  'post.insights.profileVisits': 'Переходы в профиль',
  'post.insights.saves': 'Сохранения',
  'post.insights.shares': 'Отправки',
  'post.insights.byDay': 'По дням',
  'post.insights.range': '{from} – {to}',
  'post.insights.noData': 'За эти дни пока ничего нет.',
  'post.insights.audience': 'Кого охватила публикация',
  'post.insights.followers': 'Подписчики',
  'post.insights.nonFollowers': 'Не подписаны',
  'post.insights.promotion': 'Продвижение',
  'post.insights.promotionHint':
      'Охват, клики и расходы оплаченного продвижения.',
  'post.insights.promotionOpen': 'Статистика продвижения',
  'post.insights.onlyYou': 'Статистику публикации видите только вы.',
  'post.insights.unavailable': 'Статистику публикации видит только её автор.',
  'post.insights.retry': 'Повторить',
};

const auditSocialEn = <String, String>{
  'post.stats.title': 'Post insights',
  'post.stats.likes': 'Likes',
  'post.stats.comments': 'Comments',
  'post.stats.reposts': 'Reposts',
  'post.stats.soon':
      'Only you can see this. Detailed daily insights — views, reach, saves and profile visits — will appear here soon.',
  'post.toReel.title': 'Make it a reel?',
  'post.toReel.message':
      'A reel has one video. The chosen photos will be removed.',
  'post.toReel.confirm': 'Go to reel',
  'promote.completePayment': 'Complete payment',
  // Owner 2026-10-07: Threads-style reposts.
  'post.repost': 'Repost',
  'post.unrepost': 'Undo repost',
  'post.repostedBy': '{username} reposted',
  'post.repostedByMe': 'You reposted',
  'post.repost.action': 'Repost',
  'post.reposters.title': 'Reposts',
  'post.reposters.empty': 'Nobody has reposted this yet.',
  'post.likers.empty': 'No likes yet.',
  'profile.tab.reposts': 'Reposts',
  'profile.reposts.empty.title': 'No reposts yet',
  'profile.reposts.empty.self': 'Tap ↻ under a post and it will appear here.',
  'profile.reposts.empty.other': "This user hasn't reposted anything yet.",
  // Owner 2026-10-18: the attorney profile's briefs + reposts tab.
  'profile.tab.briefsReposts': 'Briefs & reposts',
  'profile.briefsReposts.empty.title': 'No briefs or reposts yet',
  'profile.briefsReposts.empty.self':
      'Your briefs and the posts you repost will appear here.',
  'profile.briefsReposts.empty.other':
      "This attorney hasn't posted briefs or reposted anything yet.",
  'profile.briefsReposts.empty.otherUser':
      "This user hasn't posted briefs or reposted anything yet.",
  // Owner 2026-10-18: the profile's Reels tab (any role).
  'profile.tab.reels': 'Reels',
  'profile.reels.empty.title': 'No reels yet',
  'profile.reels.empty.self': 'Post a video and it will appear here.',
  'profile.reels.empty.other': 'No reels here yet.',
  'error.api.REPOST_OWN_POST': "You can't repost your own post.",
  'notif.list.post_repost': '{name} reposted your post',
  // Owner 2026-10-18 (Instagram): comments on / off and the archive.
  'post.menu.commentsOff': 'Turn off commenting',
  'post.menu.commentsOn': 'Turn on commenting',
  'post.comments.turnedOff': 'Commenting turned off',
  'post.comments.turnedOn': 'Commenting turned on',
  'post.comments.off': 'The author turned off commenting',
  'post.menu.archive': 'Archive',
  'post.menu.unarchive': 'Show on profile',
  'post.archived': 'Post archived',
  'post.unarchived': 'The post is back on your profile',
  'settings.archive': 'Archive',
  'settings.archive.hint': 'Only you can see the posts you archive',
  'archive.empty.title': 'Nothing archived',
  'archive.empty.message':
      'Archive a post from its ⋯ menu: it leaves your profile and feeds but keeps its likes and comments.',
  'archive.post.note': 'Archived — only you can see this post',
  // Owner 2026-10-18: post insights (PostInsightsScreen).
  'post.insights.published': 'Posted {date}',
  'post.insights.overview': 'Overview',
  'post.insights.reach': 'Accounts reached',
  'post.insights.impressions': 'Impressions',
  'post.insights.views': 'Views',
  'post.insights.interactions': 'Interactions',
  'post.insights.profileVisits': 'Profile visits',
  'post.insights.saves': 'Saves',
  'post.insights.shares': 'Shares',
  'post.insights.byDay': 'By day',
  'post.insights.range': '{from} – {to}',
  'post.insights.noData': 'Nothing for these days yet.',
  'post.insights.audience': 'Who it reached',
  'post.insights.followers': 'Followers',
  'post.insights.nonFollowers': 'Non-followers',
  'post.insights.promotion': 'Promotion',
  'post.insights.promotionHint':
      'Reach, clicks and spend of the paid promotion.',
  'post.insights.promotionOpen': 'Promotion insights',
  'post.insights.onlyYou': 'Only you can see these insights.',
  'post.insights.unavailable': "Only the post's author can see its insights.",
  'post.insights.retry': 'Retry',
};
