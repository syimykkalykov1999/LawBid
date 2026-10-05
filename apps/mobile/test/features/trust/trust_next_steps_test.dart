import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/strings/trust_strings.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';

/// Owner 2026-10-05: `OwnTrustDto.nextSteps` keys → human text (ru + en).
void main() {
  const en = StaticTranslatorEn();
  const ru = StaticTranslatorRu();

  test('every server step maps to a text key that resolves in ru and en', () {
    const steps = [
      'hold_review',
      'registry_check',
      'stripe_kyc',
      'firm_link',
      'fix_name',
      'documents',
    ];
    for (final step in steps) {
      final key = trustNextStepTextKey(step);
      expect(key, 'trust.next.$step');
      expect(TrustNextStep.parse(step), isNot(TrustNextStep.unknown));
      for (final t in [en, ru]) {
        final text = t.t(key);
        expect(text, isNot(key), reason: '$key must resolve');
        expect(text.trim(), isNotEmpty);
      }
    }
  });

  test('a step this build does not know still gets a sentence', () {
    expect(trustNextStepTextKey('teleport'), 'trust.next.unknown');
    expect(TrustNextStep.parse(null), TrustNextStep.unknown);
    expect(en.t('trust.next.unknown'), isNot('trust.next.unknown'));
  });

  test('level names and descriptions exist for 0..3 in both languages', () {
    for (var lv = 0; lv <= 3; lv++) {
      for (final t in [en, ru]) {
        expect(t.t(TrustLevels.nameKey(lv)), isNot(TrustLevels.nameKey(lv)));
        expect(
          t.t(TrustLevels.descriptionKey(lv)),
          isNot(TrustLevels.descriptionKey(lv)),
        );
      }
    }
    expect(en.t(TrustLevels.nameKey(0)), 'Self-declared');
    expect(ru.t(TrustLevels.nameKey(0)), 'Заявлен');
  });

  test('ru and en trust maps have the same keys', () {
    expect(trustRu.keys.toSet(), trustEn.keys.toSet());
  });

  test('OwnTrust.needsFirmEmail when pending or the next step is firm_link',
      () {
    const gate = TrustGate(
      ok: true,
      reason: null,
      missing: [],
      currentLevel: 1,
      hold: null,
    );
    const public = PublicTrust(
      attorneyId: 'a',
      level: 1,
      badge: false,
      cleared: false,
      signals: TrustSignals(
        selfAttested: true,
        licenseConfirmed: true,
        licenseConfirmedBy: LicenseConfirmedBy.registry,
        documentsVerified: false,
        stripeKyc: true,
        stripeIdentity: false,
        identityConfirmed: false,
        nameCheck: NameCheck.unknown,
        firmLinkConfirmed: false,
      ),
      acceptsPayments: false,
      canBid: true,
      registryLinks: [],
    );
    OwnTrust own(FirmLinkStatus status, List<String> steps) => OwnTrust(
          public: public,
          bidsGate: gate,
          paymentsGate: gate,
          requirements: const {
            TrustRequirement.registry,
            TrustRequirement.identity,
          },
          missing: const [TrustRequirement.identity],
          staffStatus: TrustStaffStatus.selfDeclared,
          documentsRequested: null,
          payoutDelayDays: null,
          nextSteps: steps,
          firmLink: FirmLink(
            status: status,
            source: null,
            at: null,
            emailDomain: null,
          ),
          stripeBusinessType: 'company',
        );
    expect(own(FirmLinkStatus.pending, const []).needsFirmEmail, isTrue);
    expect(
      own(FirmLinkStatus.none, const ['firm_link']).needsFirmEmail,
      isTrue,
    );
    expect(
      own(FirmLinkStatus.none, const ['documents']).needsFirmEmail,
      isFalse,
    );
    expect(own(FirmLinkStatus.none, const []).onHold, isFalse);
    final o = own(FirmLinkStatus.none, const []);
    expect(o.met(TrustRequirement.registry), isTrue);
    expect(o.met(TrustRequirement.identity), isFalse);
    expect(o.met(TrustRequirement.documents), isFalse);
  });

  test('document request templates map to texts in ru and en', () {
    for (final tpl in ['id_selfie', 'bar_card', 'firm_letter', 'custom']) {
      final key = documentRequestTextKey(tpl);
      for (final t in [en, ru]) {
        expect(t.t(key, {'note': 'x'}), isNot(key));
      }
    }
    expect(documentRequestTextKey('other'), 'trust.docs.generic');
    expect(en.t('notif.verification.trust_cleared'), contains('Check passed'));
  });

  test('bid gate errors name the missing requirements', () {
    final text = apiErrorText(
      en,
      const ApiException(
        code: ApiErrorCodes.trustLevelRequired,
        message: 'x',
        details: {
          'gate': 'bids',
          'missing': ['registry', 'identity'],
          'current': 0,
        },
      ),
    );
    expect(text, contains('State registry, Identity (Stripe)'));
    expect(
      apiErrorText(
        ru,
        const ApiException(code: ApiErrorCodes.trustLevelRequired, message: ''),
      ),
      ru.t('error.api.TRUST_LEVEL_REQUIRED.plain'),
    );
    expect(
      apiErrorText(
        en,
        const ApiException(code: ApiErrorCodes.attorneyOnHold, message: ''),
      ),
      isNot(en.t('error.default.message')),
    );
  });
}
