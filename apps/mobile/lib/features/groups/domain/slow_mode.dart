import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-11-02 (Telegram «Медленный режим»): the pauses a group offers
/// between two messages of a member who is not an admin, in seconds
/// (10 s · 30 s · 1 min · 5 min · 15 min · 60 min). 0 stands for «off».
const kSlowModeChoicesS = <int>[10, 30, 60, 300, 900, 3600];

/// «10 s» / «5 min» / «60 min» (seconds under a minute, else whole minutes
/// rounded up).
String slowModeLabel(Translator t, int seconds) => seconds < 60
    ? t.t('group.slow.sec', {'n': '$seconds'})
    : t.t('billing.mOnly', {'m': '${(seconds / 60).ceil()}'});

/// The row's value: the pause, or «Off».
String slowModeValue(Translator t, int? seconds) =>
    seconds == null || seconds == 0
        ? t.t('contact.off')
        : slowModeLabel(t, seconds);
