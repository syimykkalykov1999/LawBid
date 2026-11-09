import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/presentation/identity_check_page.dart';
import 'package:lawbid/features/verification/verification_providers.dart';

import 'verification_fakes.dart';

/// Owner 2026-11-08 («пусть пока будет ручной; подключу ключ — должен
/// работать»): the wizard uses Persona only when the server says the
/// admin's Persona card is on; otherwise the manual uploads as before.
void main() {
  late FakeVerificationBackend backend;
  late ProviderContainer container;

  Future<WizardState> ready() {
    container = ProviderContainer(
      overrides: [
        verificationRepositoryProvider.overrideWithValue(backend),
        fileUploadRepositoryProvider.overrideWithValue(backend),
      ],
    );
    addTearDown(container.dispose);
    container.listen(verificationWizardProvider, (_, __) {});
    return container.read(verificationWizardProvider.future);
  }

  WizardState now() => container.read(verificationWizardProvider).requireValue;
  VerificationWizardController ctrl() =>
      container.read(verificationWizardProvider.notifier);

  setUp(() {
    backend = FakeVerificationBackend()..request = draft();
  });

  test('server says manual: uploads required, Persona never asked', () async {
    final s = await ready();
    expect(s.usesPersona, isFalse);
    expect(s.steps, contains(WizardStep.selfie));
    expect(s.localMissing.whereType<MissingSelfie>(), isNotEmpty);
    expect(await ctrl().startIdentityCheck(), isNull);
    expect(backend.identityChecks, 0);
  });

  test(
    'server says persona: one identity step, Persona page replaces uploads',
    () async {
      backend.identityProvider = IdentityProvider.persona;
      final s = await ready();
      expect(s.usesPersona, isTrue);
      expect(s.steps, isNot(contains(WizardStep.selfie)));
      expect(s.localMissing.whereType<MissingIdentity>(), isNotEmpty);
      expect(s.localMissing.whereType<MissingSelfie>(), isEmpty);

      final url = await ctrl().startIdentityCheck();
      expect(url?.host, 'inquiry.withpersona.com');
      expect(backend.identityChecks, 1);
      expect(now().request.identityCheckStarted, isTrue);
      expect(now().localMissing, isEmpty);
    },
  );

  test(
    'Persona refused (cap used up / switched off): back to manual upload',
    () async {
      backend
        ..identityProvider = IdentityProvider.persona
        ..identityCheckError = const ApiException(
          code: ApiErrorCodes.identityProviderUnavailable,
          message: 'unavailable',
        );
      await ready();
      expect(await ctrl().startIdentityCheck(), isNull);
      expect(now().usesPersona, isFalse);
      expect(now().steps, contains(WizardStep.selfie));
    },
  );

  test('a verified attorney with no ID required never sees Persona', () async {
    backend
      ..identityRequired = false
      ..identityProvider = IdentityProvider.persona;
    final s = await ready();
    expect(s.usesPersona, isFalse);
    expect(s.steps, isNot(contains(WizardStep.identity)));
  });

  test('resumeStep: persona started → review, not started → identity', () {
    final started = VerificationRequest(
      id: 'r',
      status: RequestStatus.draft,
      licenses: [license('NY')],
      documents: const [],
      identityCheckStarted: true,
    );
    expect(
      resumeStep(
        started,
        identityRequired: true,
        barDocumentRequired: false,
        identityProvider: IdentityProvider.persona,
      ),
      WizardStep.review,
    );
    expect(
      resumeStep(
        draft(),
        identityRequired: true,
        barDocumentRequired: false,
        identityProvider: IdentityProvider.persona,
      ),
      WizardStep.identity,
    );
  });

  test(
    "only Persona's own https page is opened; web adds the return link",
    () {
      expect(
        isIdentityCheckUrl(
          Uri.parse('https://inquiry.withpersona.com/verify?inquiry-id=inq_1'),
        ),
        isTrue,
      );
      expect(
        isIdentityCheckUrl(Uri.parse('https://evil.example/verify')),
        isFalse,
      );
      expect(
        isIdentityCheckUrl(Uri.parse('http://inquiry.withpersona.com/verify')),
        isFalse,
      );
      final back = withReturn(
        Uri.parse('https://inquiry.withpersona.com/verify?inquiry-id=inq_1'),
        Uri.parse('https://lawbid.dev/verification/wizard'),
      );
      expect(back.queryParameters['inquiry-id'], 'inq_1');
      expect(
        back.queryParameters['redirect-uri'],
        'https://lawbid.dev/verification/wizard',
      );
    },
  );
}
