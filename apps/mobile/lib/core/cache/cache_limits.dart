/// Owner 2026-10-22 (client economy plan §5.1): one store of the phone's
/// cache, with its byte limit. The ceilings come from the admin
/// (`app_config` `cache.limit_mb.*`, sent in `GET /config/bootstrap`); the
/// user may only lower them on «Данные и память».
enum CacheStore {
  http('http', 32),
  messages('messages', 50),
  feed('feed', 8),
  images('images', 500),
  chatMedia('chat_media', 300),
  files('files', 200),
  video('video', 300),

  /// l10n, recent searches, dedup, the events queue, translations.
  other('other', 5);

  const CacheStore(this.configKey, this.defaultMb);

  /// The suffix of the admin's `cache.limit_mb.<key>`.
  final String configKey;
  final int defaultMb;
}

/// «Хранить медиа чатов»: 3 days / 1 week / 1 month / always (0).
enum KeepMedia {
  threeDays(3),
  week(7),
  month(30),
  always(0);

  const KeepMedia(this.days);

  final int days;

  static KeepMedia fromDays(int days) => switch (days) {
        <= 0 => KeepMedia.always,
        <= 3 => KeepMedia.threeDays,
        <= 7 => KeepMedia.week,
        _ => KeepMedia.month,
      };
}

/// The effective limits: the admin's ceiling, lowered by the user's choice.
class CacheLimits {
  const CacheLimits({
    this.ceilingMb = const {},
    this.userMb = const {},
    this.keepMediaCeilingDays = 30,
    this.userKeepMediaDays,
  });

  /// Parses the `cache.*` keys of `app_config`.
  factory CacheLimits.fromAppConfig(
    Map<String, String> config, {
    Map<CacheStore, int> userMb = const {},
    int? userKeepMediaDays,
  }) {
    final ceilings = <CacheStore, int>{};
    for (final s in CacheStore.values) {
      final v = int.tryParse(config['cache.limit_mb.${s.configKey}'] ?? '');
      if (v != null && v > 0) ceilings[s] = v;
    }
    final keep = int.tryParse(config['cache.keep_media_days.default'] ?? '');
    return CacheLimits(
      ceilingMb: ceilings,
      userMb: userMb,
      keepMediaCeilingDays: keep == null || keep < 0 ? 30 : keep,
      userKeepMediaDays: userKeepMediaDays,
    );
  }

  /// Admin ceilings by store (missing = the store's default).
  final Map<CacheStore, int> ceilingMb;

  /// The user's lower limits by store (missing = the ceiling).
  final Map<CacheStore, int> userMb;

  /// `cache.keep_media_days.default` (0 = always).
  final int keepMediaCeilingDays;
  final int? userKeepMediaDays;

  int ceilingOf(CacheStore s) => ceilingMb[s] ?? s.defaultMb;

  int limitMb(CacheStore s) {
    final ceiling = ceilingOf(s);
    final user = userMb[s];
    return user == null ? ceiling : (user < ceiling ? user : ceiling);
  }

  int limitBytes(CacheStore s) => limitMb(s) * 1024 * 1024;

  /// Days to keep chat media; 0 = always. The user cannot keep longer than
  /// the admin allows (an admin «always» leaves every choice open).
  int get keepMediaDays {
    final user = userKeepMediaDays;
    final ceiling = keepMediaCeilingDays;
    if (user == null) return ceiling;
    if (ceiling == 0) return user;
    if (user == 0) return ceiling;
    return user < ceiling ? user : ceiling;
  }

  KeepMedia get keepMedia => KeepMedia.fromDays(keepMediaDays);
}
