import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';

import '../../helpers/upload_queue_overrides.dart';
import 'fake_group_repository.dart';

const _key = (groupId: 'g1', topicId: null);

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 80));

/// Owner 2026-11-08 (every upload finishes): with `group_files_from_disk`
/// off (prod today) the files are uploaded by the screen; a file still on
/// its way when the group was closed was never sent.
void main() {
  test('files uploaded while the group is closed still go out, in order',
      () async {
    final repo = FakeGroupRepository();
    final c = ProviderContainer(
      overrides: [
        groupRepositoryProvider.overrideWithValue(repo),
        realtimeClientProvider.overrideWithValue(null),
        ...uploadQueueOverrides(uploader: FakeStorageUploader()),
      ],
    );
    addTearDown(c.dispose);
    final screen = c.listen(groupThreadProvider(_key), (_, __) {});
    await _settle();
    final thread = c.read(groupThreadProvider(_key).notifier);
    final gate = Completer<void>();

    final run = thread.uploadAndSend<String>(
      items: const ['a.pdf', 'b.pdf'],
      atOnce: 2,
      upload: (name) async {
        await gate.future;
        return 'file-$name';
      },
      send: (i, name, fileId) =>
          thread.sendAttachment(fileId: fileId, fileName: name),
    );
    await _settle();
    screen.close(); // the group screen is gone while the files go up
    await _settle();
    gate.complete();
    await run;
    await _settle();

    expect(repo.sentBodies.map((b) => b.fileId), ['file-a.pdf', 'file-b.pdf']);
  });
}
