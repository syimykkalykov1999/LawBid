/// Owner 2026-10-22 (client economy plan §5.1): one store of the phone's
/// cache, with its byte limit. The ceilings come from the admin
/// (`app_config` `cache.limit_mb.*`, sent in `GET /config/bootstrap`); the
/// user may only lower them on «Данные и память».
///
/// Owner 2026-11-03 (cache like Telegram): the media stores have no ceiling
/// of their own (`defaultMb` 0 = none unless the admin sets one); what they
/// may take together is the user's [CacheLimits.capMb] (default 10 GB),
/// kept least-recently-opened first.
enum CacheStore {
  http('http', 32),
  messages('messages', 50),
  feed('feed', 8),
  images('images', 0),
  chatMedia('chat_media', 0),
  files('files', 0),
  video('video', 1000),

  /// l10n, recent searches, dedup, the events queue, translations.
  other('other', 5);

  const CacheStore(this.configKey, this.defaultMb);

  /// The suffix of the admin's `cache.limit_mb.<key>`.
  final String configKey;

  /// 0 = no ceiling of its own.
  final int defaultMb;
}

/// «Автоудаление закэшированных медиа»: Never / 3 days / 1 week / 1 month,
/// counted from the last time the media was opened.
enum AutoDeleteAge {
  never(0),
  threeDays(3),
  week(7),
  month(30);

  const AutoDeleteAge(this.days);

  /// 0 = never.
  final int days;

  static AutoDeleteAge fromDays(int days) => switch (days) {
        <= 0 => AutoDeleteAge.never,
        <= 3 => AutoDeleteAge.threeDays,
        <= 7 => AutoDeleteAge.week,
        _ => AutoDeleteAge.month,
      };
}

/// What the auto-delete age applies to (Telegram: private chats, groups,
/// channels; here the feed, reels and channels are one).
enum AutoDeleteScope {
  privateChats('private_chats', 0),
  groups('groups', 30),
  feed('feed', 7);

  const AutoDeleteScope(this.key, this.defaultDays);

  final String key;

  /// Owner 2026-11-03: private chats never, groups 1 month, feed 1 week.
  final int defaultDays;
}

/// The effective limits: the admin's ceiling, lowered by the user's choice.
class CacheLimits {
  const CacheLimits({
    this.ceilingMb = const {},
    this.userMb = const {},
    this.userCapMb,
    this.userAutoDeleteDays = const {},
  });

  /// Parses the `cache.*` keys of `app_config`.
  factory CacheLimits.fromAppConfig(
    Map<String, String> config, {
    Map<CacheStore, int> userMb = const {},
    int? userCapMb,
    Map<AutoDeleteScope, int> userAutoDeleteDays = const {},
  }) {
    final ceilings = <CacheStore, int>{};
    for (final s in CacheStore.values) {
      final v = int.tryParse(config['cache.limit_mb.${s.configKey}'] ?? '');
      if (v != null && v > 0) ceilings[s] = v;
    }
    return CacheLimits(
      ceilingMb: ceilings,
      userMb: userMb,
      userCapMb: userCapMb,
      userAutoDeleteDays: userAutoDeleteDays,
    );
  }

  /// The stops of «Максимальный размер кэша» (MB; 0 = «Нет»).
  static const capStopsMb = [5 * 1024, 10 * 1024, 30 * 1024, 0];

  /// Owner 2026-11-03: 10 GB unless the user moves the slider.
  static const defaultCapMb = 10 * 1024;

  /// Stands for «no limit» where a byte count is needed.
  static const unboundedBytes = 1 << 50;

  /// Admin ceilings by store (missing = the store's default).
  final Map<CacheStore, int> ceilingMb;

  /// The user's lower limits by store (missing = the ceiling).
  final Map<CacheStore, int> userMb;

  /// The user's cap for all cached media together (null = the default,
  /// 0 = no cap).
  final int? userCapMb;

  /// The user's auto-delete choice by scope (missing = the scope's default).
  final Map<AutoDeleteScope, int> userAutoDeleteDays;

  int ceilingOf(CacheStore s) => ceilingMb[s] ?? s.defaultMb;

  /// 0 = the store has no limit of its own.
  int limitMb(CacheStore s) {
    final ceiling = ceilingOf(s);
    final user = userMb[s];
    if (user == null) return ceiling;
    return ceiling <= 0 || user < ceiling ? user : ceiling;
  }

  int limitBytes(CacheStore s) {
    final mb = limitMb(s);
    return mb <= 0 ? unboundedBytes : mb * 1024 * 1024;
  }

  /// The cap on all cached media together, in MB (0 = none).
  int get capMb => userCapMb ?? defaultCapMb;

  /// null = no cap.
  int? get capBytes => capMb <= 0 ? null : capMb * 1024 * 1024;

  /// Days of not opening after which [scope]'s media goes (0 = never).
  int autoDeleteDays(AutoDeleteScope scope) =>
      userAutoDeleteDays[scope] ?? scope.defaultDays;

  AutoDeleteAge autoDelete(AutoDeleteScope scope) =>
      AutoDeleteAge.fromDays(autoDeleteDays(scope));
}
