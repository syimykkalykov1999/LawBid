import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_photo_outbox.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/upload_queue_overrides.dart';
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

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 80));

/// Owner 26.11 (WhatsApp): a group photo change shows the picked picture at
/// once, goes through the app's queue (upload + the server's check) and is
/// set on the group when clean; a refused photo goes back to the old one.
void main() {
  final jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);

  ProviderContainer container(_Repo repo, FakeAvatarRepo uploads) {
    final c = ProviderContainer(
      overrides: [
        groupRepositoryProvider.overrideWithValue(repo),
        realtimeClientProvider.overrideWithValue(null),
        avatarUploadRepositoryProvider.overrideWithValue(uploads),
        ...uploadQueueOverrides(),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  test('shown at once, set on the group once the check is through', () async {
    final repo = _Repo();
    final hold = Completer<ScanOutcome>();
    final uploads = FakeAvatarRepo(me: attorneyMe())..holdConfirm = hold;
    final c = container(repo, uploads);

    await c.read(groupPhotoOutboxProvider).submit('g1', jpeg);
    // the picture is there before anything reached the server
    expect(c.read(groupPhotoPreviewsProvider)['g1']?.bytes, jpeg);
    await _settle();
    expect(repo.sent, isEmpty, reason: 'the server still checks it');

    hold.complete(ScanOutcome.clean);
    await _settle();
    expect(repo.sent.single.avatarFileId, 'f1');
    // still the local picture (no reload), now tied to the group's link
    final p = c.read(groupPhotoPreviewsProvider)['g1'];
    expect(p?.bytes, jpeg);
    expect(p?.url, groupDetail().avatarUrl);
  });

  test('a refused photo goes back to the old one', () async {
    final repo = _Repo();
    final hold = Completer<ScanOutcome>();
    final uploads = FakeAvatarRepo(me: attorneyMe())..holdConfirm = hold;
    final c = container(repo, uploads);

    await c.read(groupPhotoOutboxProvider).submit('g1', jpeg);
    expect(c.read(groupPhotoPreviewsProvider)['g1'], isNotNull);
    await _settle();
    hold.complete(ScanOutcome.rejected);
    await _settle();

    expect(repo.sent, isEmpty);
    expect(c.read(groupPhotoPreviewsProvider)['g1'], isNull);
  });
}
