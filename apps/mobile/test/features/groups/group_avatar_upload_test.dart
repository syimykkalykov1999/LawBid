import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/groups/application/group_avatar_upload.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';

import '../profile/profile_fakes.dart';

/// Owner 26.11 («Новая группа» photo sat on «Загрузка… 100%»): after the
/// storage upload the server's antivirus check runs; the new-group photo
/// now takes the profile photo's steps — a «checking» stage instead of
/// «100%», and a photo the storage already has is not sent again.
void main() {
  final jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);

  ProviderContainer container(FakeAvatarRepo repo) {
    final c = ProviderContainer(
      overrides: [avatarUploadRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(c.dispose);
    final sub = c.listen(groupAvatarUploadProvider, (_, __) {});
    addTearDown(sub.close);
    return c;
  }

  test('while the server checks the photo the stage is checking', () async {
    final hold = Completer<ScanOutcome>();
    final repo = FakeAvatarRepo(me: attorneyMe())..holdConfirm = hold;
    final c = container(repo);
    final run = c.read(groupAvatarUploadProvider.notifier).start(jpeg);
    await Future<void>.delayed(Duration.zero);
    expect(c.read(groupAvatarUploadProvider).stage, GroupAvatarStage.checking);
    expect(c.read(groupAvatarUploadProvider).busy, isTrue);
    hold.complete(ScanOutcome.clean);
    await run;
    final done = c.read(groupAvatarUploadProvider);
    expect(done.stage, GroupAvatarStage.done);
    expect(done.fileId, 'f1');
    expect(repo.steps, ['presign:image/jpeg:8', 'upload', 'confirm']);
  });

  test('a photo the storage already has is not uploaded again', () async {
    final repo = FakeAvatarRepo(me: attorneyMe())..alreadyStored = true;
    final c = container(repo);
    await c.read(groupAvatarUploadProvider.notifier).start(jpeg);
    expect(repo.steps, ['presign:image/jpeg:8']);
    expect(c.read(groupAvatarUploadProvider).stage, GroupAvatarStage.done);
    expect(c.read(groupAvatarUploadProvider).fileId, 'f1');
  });
}
