import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/uploads/upload_files_memory.dart';
import 'package:lawbid/core/uploads/upload_queue.dart' show uploadFilesProvider;
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/avatar_upload_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';

import 'profile_fakes.dart';

class _Me extends CurrentUserController {
  @override
  CurrentUserState build() => CurrentUserState.ready(attorneyMe());
}

/// Owner 26.11: a profile photo picked just before the app was closed shows
/// again at once after the restart (kept in the upload queue's folder) and
/// goes on until it is attached; then the kept copy is gone.
void main() {
  final jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);

  ProviderContainer run(MemoryUploadFiles files, FakeAvatarRepo repo) {
    final c = ProviderContainer(
      overrides: [
        uploadFilesProvider.overrideWithValue(files),
        avatarUploadRepositoryProvider.overrideWithValue(repo),
        currentUserControllerProvider.overrideWith(_Me.new),
      ],
    );
    addTearDown(c.dispose);
    final sub = c.listen(avatarUploadControllerProvider, (_, __) {});
    addTearDown(sub.close);
    return c;
  }

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 20));

  test('a photo on its way when the app closed shows and goes on', () async {
    final files = MemoryUploadFiles();
    // the first run: picked, the server still checks it, the app closes
    final first = run(
      files,
      FakeAvatarRepo(me: attorneyMe())..holdConfirm = Completer<ScanOutcome>(),
    );
    unawaited(first.read(avatarUploadControllerProvider.notifier).start(jpeg));
    await settle();
    final name = AvatarUploadController.pendingName(attorneyMe().id);
    expect(await files.read(name), jpeg, reason: 'kept for a restart');
    first.dispose();

    // the restart: the picture is there again, the upload goes on
    final repo = FakeAvatarRepo(me: attorneyMe(avatarUrl: 'https://cdn/a'));
    final second = run(files, repo);
    await settle();
    expect(second.read(avatarUploadControllerProvider).shownPreview, jpeg);
    await settle();
    expect(repo.steps, contains('attach:f1'));
    expect(
      second.read(avatarUploadControllerProvider).stage,
      AvatarUploadStage.done,
    );
    expect(await files.read(name), isNull, reason: 'attached: not kept');
  });

  test('a refused photo is not shown again after a restart', () async {
    final files = MemoryUploadFiles();
    final hold = Completer<ScanOutcome>();
    final first =
        run(files, FakeAvatarRepo(me: attorneyMe())..holdConfirm = hold);
    unawaited(first.read(avatarUploadControllerProvider.notifier).start(jpeg));
    await settle();
    hold.complete(ScanOutcome.rejected);
    await settle();
    expect(
      first.read(avatarUploadControllerProvider).stage,
      AvatarUploadStage.failed,
    );
    expect(
      await files.read(AvatarUploadController.pendingName(attorneyMe().id)),
      isNull,
    );
  });
}
