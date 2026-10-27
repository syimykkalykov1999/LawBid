// Rows for the page types of 2026-10-27 (attorney posts, city hubs, legal Q&A):
// the shape the API job builds from the database and the shape of the
// `posts` / `questions` keys of an offline data file.
export const LONG =
  'Divorce in New York usually starts with a summons or a summons with a complaint, and the other side then has a fixed time to answer. ' +
  'Courts look at the length of the marriage, each spouse income, and the interests of the children when they decide on custody and support. ' +
  'Gather tax returns, bank statements and a list of property before you meet an attorney, because those papers drive most of the early decisions.';

export const attorney = (username, o = {}) => ({
  username,
  displayName: o.name ?? username.replace(/\b\w/g, (c) => c.toUpperCase()),
  bio: o.bio ?? null,
  firmNames: [],
  languages: ['en'],
  ratingAvg: 0,
  ratingCount: 0,
  trustBadge: true,
  photoUrl: null,
  practiceAreas: (o.practices ?? ['family_law.divorce']).map((code) => ({ code, name: code })),
  licensedStates: o.states ?? ['NY'],
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...(o.city ? { city: o.city, cityState: o.cityState ?? (o.states ?? ['NY'])[0] } : {}),
  ...(o.seoOptIn === false ? { seoOptIn: false } : {}),
});

export const post = (id, authorUsername, o = {}) => ({
  id,
  authorUsername,
  title: o.title === undefined ? 'What happens after a divorce summons in New York' : o.title,
  body: o.body ?? LONG,
  kind: 'post',
  practiceCode: o.practiceCode ?? 'family_law.divorce',
  language: 'en',
  createdAt: o.createdAt ?? '2026-10-10T09:00:00.000Z',
  updatedAt: o.updatedAt ?? '2026-10-11T09:00:00.000Z',
  ...(o.hasMedia ? { hasMedia: true } : {}),
  ...(o.videoId ? { videoId: o.videoId } : {}),
});

export const question = (id, answers, o = {}) => ({
  id,
  title: o.title ?? 'How long do I have to answer a divorce summons in New York?',
  body: o.body ?? 'I was served papers last week. I am not sure what the deadline is or what happens if I miss it.',
  practiceCode: o.practiceCode ?? 'family_law.divorce',
  stateCode: o.stateCode ?? 'NY',
  createdAt: '2026-10-05T09:00:00.000Z',
  updatedAt: o.updatedAt ?? '2026-10-06T09:00:00.000Z',
  answers,
});

export const answer = (id, attorneyUsername, o = {}) => ({
  id,
  attorneyUsername,
  body: o.body ?? LONG,
  reviewed: o.reviewed ?? true,
  createdAt: '2026-10-05T12:00:00.000Z',
  updatedAt: '2026-10-06T08:00:00.000Z',
});

/** Three Brooklyn family-law attorneys, one Texas attorney, one NY attorney without a city. */
export const roster = () => [
  attorney('ann.nyc', { name: 'Ann Nyc', city: 'Brooklyn' }),
  attorney('ben.nyc', { name: 'Ben Nyc', city: 'Brooklyn' }),
  attorney('cat.nyc', { name: 'Cat Nyc', city: 'Brooklyn' }),
  attorney('dan.tx', { name: 'Dan Tx', states: ['TX'], city: 'Austin' }),
  attorney('eve.nocity', { name: 'Eve Nocity' }),
];
