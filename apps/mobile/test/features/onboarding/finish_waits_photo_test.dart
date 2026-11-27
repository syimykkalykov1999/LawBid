import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/profile/application/avatar_upload_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';

class _Me extends CurrentUserController {
  _Me(this._user);

  final CurrentUser _user;

  @override
  CurrentUserState build() => CurrentUserState.ready(_user);
}

/// Owner 26.11: the attorney goes on while his photo is still checked; the
/// server needs it clean and attached to finish onboarding, so «finish»
/// waits for the photo instead of being refused.
void main() {
  test('finishing onboarding waits for the photo still being checked',
      () async {
    final me = meFixture(
      role: UserRole.attorney,
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      firstName: 'Ann',
      lastName: 'Lee',
      step: OnboardingStepId.verification,
    );
    final onboarding = FakeOnboardingRepository(me);
    final hold = Completer<ScanOutcome>();
    final uploads = FakeAvatarRepo(me: attorneyMe())..holdConfirm = hold;
    final c = ProviderContainer(
      overrides: [
        onboardingRepositoryProvider.overrideWithValue(onboarding),
        currentUserControllerProvider.overrideWith(() => _Me(me)),
        avatarUploadRepositoryProvider.overrideWithValue(uploads),
      ],
    );
    addTearDown(c.dispose);
    final keep = [
      c.listen(avatarUploadControllerProvider, (_, __) {}),
      c.listen(onboardingActionsProvider, (_, __) {}),
    ];
    addTearDown(() {
      for (final k in keep) {
        k.close();
      }
    });

    unawaited(
      c.read(avatarUploadControllerProvider.notifier).start(
            Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]),
          ),
    );
    await Future<void>.delayed(Duration.zero);
    expect(c.read(avatarUploadControllerProvider).busy, isTrue);

    final finish = c.read(onboardingActionsProvider.notifier).complete();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(
      onboarding.calls,
      isNot(contains('complete')),
      reason: 'the photo is still checked',
    );

    hold.complete(ScanOutcome.clean);
    await finish;
    expect(uploads.steps, contains('attach:f1'));
    expect(onboarding.calls, contains('complete'));
  });
}
