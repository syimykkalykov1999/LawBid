// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-05: legal posts vs everyday (personal) posts. "Content"
// next to "All" in the feed: every post or legal posts only; the "Posts"
// topic lists everyday posts; the author marks a post without a topic as
// legal. Other languages: tmp-import/feed-filter-keys-update.xlsx.

const feedContentRu = <String, String>{
  'feed.content.title': 'Контент',
  'feed.content.all': 'Весь контент',
  'feed.content.legalOnly': 'Только юр.',
  'feed.content.optionAll': 'Все посты',
  'feed.content.optionAllHint': 'Юридические и обычные посты',
  'feed.content.optionLegal': 'Только юридические',
  'feed.content.optionLegalHint':
      'Обычные посты скрыты в ленте, поиске и рекомендациях',
  'feed.topics.posts': 'Посты',
  'feed.topics.postsHint': 'Обычные посты: еда, путешествия, жизнь',
  'feed.posts.empty': 'Обычных постов пока нет',
  'post.create.legal': 'Юридический пост',
  'post.create.legalHint':
      'Без темы пост считается обычным. Включите, если он о праве.',
};

const feedContentEn = <String, String>{
  'feed.content.title': 'Content',
  'feed.content.all': 'All content',
  'feed.content.legalOnly': 'Legal only',
  'feed.content.optionAll': 'All posts',
  'feed.content.optionAllHint': 'Legal and everyday posts',
  'feed.content.optionLegal': 'Legal posts only',
  'feed.content.optionLegalHint':
      'Everyday posts are hidden in the feed, search and recommendations',
  'feed.topics.posts': 'Posts',
  'feed.topics.postsHint': 'Everyday posts: food, travel, life',
  'feed.posts.empty': 'No everyday posts yet',
  'post.create.legal': 'Legal post',
  'post.create.legalHint':
      'Without a topic, a post counts as everyday. Turn on if it is about law.',
};
