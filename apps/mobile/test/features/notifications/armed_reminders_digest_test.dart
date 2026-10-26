import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/notifications/application/task_reminders.dart';

/// Owner 2026-10-22 (delta audit D-P3): an iPhone tells the server which
/// reminders it holds only when that set changed (or once a day).
void main() {
  final now = DateTime.utc(2026, 10, 22, 12);

  test('the digest ignores order and tells another set, token or user', () {
    final a = armedDigest('u1', 'tok', ['t1@1', 't2@2']);
    expect(armedDigest('u1', 'tok', ['t2@2', 't1@1']), a);
    expect(armedDigest('u1', 'tok', ['t1@1']), isNot(a));
    expect(armedDigest('u1', 'tok2', ['t1@1', 't2@2']), isNot(a));
    expect(armedDigest('u2', 'tok', ['t1@1', 't2@2']), isNot(a));
    expect(armedDigest('u1', 'tok', const []), isNotEmpty);
  });

  test('nothing sent yet, or a different set: send', () {
    final d = armedDigest('u1', 'tok', ['t1@1']);
    expect(armedNeedsSending(null, d, now), isTrue);
    expect(
      armedNeedsSending(
        '${armedDigest('u1', 'tok', ['t9@9'])}@${now.millisecondsSinceEpoch}',
        d,
        now,
      ),
      isTrue,
    );
    expect(armedNeedsSending('garbage', d, now), isTrue);
  });

  test('the same set sent a moment ago is not sent again; a day later it is',
      () {
    final d = armedDigest('u1', 'tok', ['t1@1']);
    final stored = '$d@${now.millisecondsSinceEpoch}';
    expect(armedNeedsSending(stored, d, now), isFalse);
    expect(
      armedNeedsSending(stored, d, now.add(const Duration(hours: 23))),
      isFalse,
    );
    expect(
      armedNeedsSending(stored, d, now.add(armedResendAfter)),
      isTrue,
    );
  });
}
