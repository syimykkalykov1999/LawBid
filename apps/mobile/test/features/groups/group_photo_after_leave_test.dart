import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_info_screen.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';
import 'package:lawbid/features/profile/presentation/widgets/avatar_picker_field.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../profile/profile_fakes.dart';
import 'fake_group_repository.dart';

class _Repo extends FakeGroupRepository {
  _Repo() : super(const [], groupDetail(), const []);

  final sent = <api.UpdateGroupDto>[];

  @override
  Future<api.GroupDetailDto> update(String id, api.UpdateGroupDto body) async {
    sent.add(body);
    return groupDetail();
  }
}

/// Owner 2026-11-08 (the profile photo bug, R2): a group photo that reached
/// storage is set on the group even when the info screen was closed while
/// the server still checked it.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('leaving the info screen during the check still sets the photo',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(390, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repo = _Repo();
    final hold = Completer<ScanOutcome>();
    final uploads = FakeAvatarRepo(me: attorneyMe())..holdConfirm = hold;
    final jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            partnerOffOverride,
            groupRepositoryProvider.overrideWithValue(repo),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
            avatarUploadRepositoryProvider.overrideWithValue(uploads),
            avatarImagePickerProvider.overrideWithValue((_) async => jpeg),
          ],
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const GroupInfoScreen(groupId: 'g1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byKey(const ValueKey('group-info-photo-edit')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Выбрать из галереи'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(uploads.steps, contains('confirm'));

    await tester.pumpWidget(const SizedBox()); // the screen is gone
    hold.complete(ScanOutcome.clean);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(repo.sent.single.avatarFileId, 'f1');
    await tester.pump(const Duration(minutes: 6));
  });
}
