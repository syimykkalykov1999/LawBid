import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smart_auth/smart_auth.dart';

/// OTP autofill from the incoming SMS (docs/01_FOUNDATION_AUTH.md §10.2 D:
/// "автоподстановка SMS (Android SMS Retriever, iOS oneTimeCode)").
///
/// iOS needs nothing here — `AutofillHints.oneTimeCode` on AppOtpField
/// already surfaces the keyboard's "From Messages" suggestion. Android's
/// SMS Retriever API reads the code WITHOUT any SMS permission, but only
/// from a message that ends with this app's 11-character hash
/// ([appSignature]) — the server's SMS template must append it (see
/// docs/changelog.d/leaf-1.4.md: note for the auth/SMS server leaf).
/// Each flavor (and debug vs release signing key) has its own hash.
abstract interface class SmsCodeRetriever {
  /// False on iOS/web/tests: nothing is started.
  bool get isSupported;

  /// Starts one SMS Retriever session (valid ~5 minutes) and completes
  /// with the 6-digit code from the first matching SMS, or null on
  /// timeout/failure/cancel. Must be started BEFORE the SMS is sent.
  Future<String?> listenForCode();

  /// Stops a pending [listenForCode] session.
  Future<void> stop();

  /// The app hash the SMS must contain (for server configuration / QA).
  Future<String?> appSignature();
}

/// Android implementation over `smart_auth` (SMS Retriever API, Google
/// Play services; maintained by the pinput author).
class SmartAuthSmsCodeRetriever implements SmsCodeRetriever {
  SmartAuthSmsCodeRetriever({SmartAuth? smartAuth, bool? isAndroid})
      : _smartAuth = smartAuth ?? SmartAuth.instance,
        _isAndroid = isAndroid ?? (!kIsWeb && Platform.isAndroid);

  final SmartAuth _smartAuth;
  final bool _isAndroid;

  /// Exactly 6 digits, not part of a longer number (e.g. the app hash can
  /// contain digits, and a US phone number might appear in the text).
  static const codeMatcher = r'(?<!\d)\d{6}(?!\d)';

  @override
  bool get isSupported => _isAndroid;

  @override
  Future<String?> listenForCode() async {
    if (!isSupported) return null;
    final result =
        await _smartAuth.getSmsWithRetrieverApi(matcher: codeMatcher);
    final code = result.data?.code;
    return (code != null && RegExp(r'^\d{6}$').hasMatch(code)) ? code : null;
  }

  @override
  Future<void> stop() async {
    if (!isSupported) return;
    await _smartAuth.removeSmsRetrieverApiListener();
  }

  @override
  Future<String?> appSignature() async {
    if (!isSupported) return null;
    return (await _smartAuth.getAppSignature()).data;
  }
}

final smsCodeRetrieverProvider =
    Provider<SmsCodeRetriever>((ref) => SmartAuthSmsCodeRetriever());
