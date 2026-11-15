import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/auth/data/sms_code_retriever.dart';
import 'package:smart_auth/smart_auth.dart';

/// smart_auth 4 (row 118): a waiting SMS call now finishes as
/// `SmartAuthResult.canceled()` when [SmsCodeRetriever.stop] runs or a new
/// session starts (3.x left that Future pending forever). The retriever must
/// turn that into "no code" and only ever hand over exactly six digits.
class _FakeSmartAuth implements SmartAuth {
  _FakeSmartAuth(this.result);

  final SmartAuthResult<SmartAuthSms> result;
  String? matcher;
  int removed = 0;

  @override
  Future<SmartAuthResult<SmartAuthSms>> getSmsWithRetrieverApi({
    String matcher = '',
  }) async {
    this.matcher = matcher;
    return result;
  }

  @override
  Future<SmartAuthResult<void>> removeSmsRetrieverApiListener() async {
    removed++;
    return const SmartAuthResult.success(null);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('a matched six-digit code is returned', () async {
    final fake = _FakeSmartAuth(
      const SmartAuthResult.success(
        SmartAuthSms(sms: 'LawBid code 123456 abcDEF12345', code: '123456'),
      ),
    );
    final r = SmartAuthSmsCodeRetriever(smartAuth: fake, isAndroid: true);
    expect(await r.listenForCode(), '123456');
    expect(fake.matcher, SmartAuthSmsCodeRetriever.codeMatcher);
  });

  test('a canceled session (stop / new session) is no code', () async {
    final fake = _FakeSmartAuth(const SmartAuthResult.canceled());
    final r = SmartAuthSmsCodeRetriever(smartAuth: fake, isAndroid: true);
    expect(await r.listenForCode(), isNull);
    await r.stop();
    expect(fake.removed, 1);
  });

  test('a failure is no code', () async {
    final fake = _FakeSmartAuth(const SmartAuthResult.failure('timeout'));
    final r = SmartAuthSmsCodeRetriever(smartAuth: fake, isAndroid: true);
    expect(await r.listenForCode(), isNull);
  });

  test('off Android nothing is started', () async {
    final fake = _FakeSmartAuth(const SmartAuthResult.canceled());
    final r = SmartAuthSmsCodeRetriever(smartAuth: fake, isAndroid: false);
    expect(await r.listenForCode(), isNull);
    expect(fake.matcher, isNull);
  });
}
