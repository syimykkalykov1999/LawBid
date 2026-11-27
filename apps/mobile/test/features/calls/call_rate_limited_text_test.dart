import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';

/// 26.11 (call spam): the server refuses a call start with 429
/// RATE_LIMITED (too many starts, or too many unanswered rings in a row to
/// the same person); the call screen says so instead of «Call failed».
void main() {
  const ended = CallSession(phase: CallPhase.ended, errorCode: 'RATE_LIMITED');

  test('RATE_LIMITED reads «Too many attempts…»', () {
    expect(
      callStatusText(const StaticTranslatorEn(), ended),
      'Too many attempts. Please try again later.',
    );
    expect(
      callStatusText(const StaticTranslatorRu(), ended),
      'Слишком много попыток. Попробуйте позже.',
    );
  });
}
