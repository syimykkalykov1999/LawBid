import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-10-21 (WhatsApp «Disappearing messages»): the timers a chat
/// or a group offers, in seconds. 0 stands for «off» in pickers.
const kDisappearChoicesS = <int>[86400, 604800, 7776000];

/// «24 hours» / «7 days» / «90 days».
String disappearLabel(Translator t, int seconds) => switch (seconds) {
      86400 => t.t('dm.d1'),
      604800 => t.t('dm.d7'),
      7776000 => t.t('dm.d90'),
      _ => t.t('dm.d${(seconds / 86400).round()}'),
    };

/// The row's value: the timer, or «Off».
String disappearValue(Translator t, int? seconds) =>
    seconds == null || seconds == 0
        ? t.t('contact.off')
        : disappearLabel(t, seconds);

/// A chat's service line body: `disappear:<seconds>` or `disappear_off`.
bool isDisappearLine(String body) =>
    body == 'disappear_off' || body.startsWith('disappear:');

/// «Ann: disappearing messages on · 7 days» / «…off».
String disappearLineText(Translator t, String body, {required String name}) {
  final seconds = int.tryParse(body.split(':').last);
  if (body == 'disappear_off' || seconds == null || seconds == 0) {
    return t.t('dm.line.off', {'name': name});
  }
  return t.t('dm.line.on', {'name': name, 'time': disappearLabel(t, seconds)});
}
