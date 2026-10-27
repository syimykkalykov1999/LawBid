/** Government-request workspace: labels and small pure helpers. */

export const LEGAL_SECTION_LABEL = {
  profile: 'Профиль и контакты',
  devices: 'Входы, устройства, IP',
  usernames: 'Юзернеймы и история',
  chats: 'Личные чаты',
  groups: 'Группы',
  channel_posts: 'Посты каналов',
  posts: 'Публикации',
  reels: 'Рилсы',
  stories: 'Истории',
  questions: 'Вопросы',
} as const;
export type LegalSection = keyof typeof LEGAL_SECTION_LABEL;
export const LEGAL_SECTIONS = Object.keys(LEGAL_SECTION_LABEL) as LegalSection[];

/** Which account-card counter backs a section (none = no count). */
export const LEGAL_SECTION_COUNT: Partial<Record<LegalSection, string>> = {
  chats: 'messages',
  groups: 'groups',
  channel_posts: 'channelPosts',
  posts: 'posts',
  reels: 'reels',
  stories: 'stories',
  questions: 'questions',
  devices: 'sessions',
};

export const LEGAL_EXPORT_STATUS: Record<string, string> = {
  queued: 'в очереди',
  running: 'собирается',
  ready: 'готов',
  failed: 'ошибка',
  expired: 'срок вышел',
};

export const LEGAL_HOLD_TARGET: Record<string, string> = {
  user: 'человек',
  case: 'кейс',
  conversation: 'чат',
  group: 'группа',
};

export const MATCHED_BY: Record<string, string> = {
  id: 'по id',
  phone: 'по телефону',
  email: 'по e-mail',
  username: 'по юзернейму',
  name: 'по имени',
};

/** The X-Justification the API requires on these routes (≥ 10 characters). */
export function legalJustification(requestType: string, ref: string, agency: string): string {
  return encodeURIComponent(`${requestType} № ${ref}, ${agency}`.slice(0, 500));
}

/** `<input type=date>` value → ISO bound (start or end of that UTC day). */
export function dayBound(value: string, end: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

/** An export still moving: the list refreshes while one is. */
export function hasActiveExport(rows: { status: string }[] | undefined): boolean {
  return !!rows?.some((r) => r.status === 'queued' || r.status === 'running');
}
