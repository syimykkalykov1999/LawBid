import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_bubble.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Audit 26.10 B9: a group file that was not sent can be sent again, like a
/// file in a one-to-one chat (Retry next to «Not sent»).
void main() {
  const en = StaticTranslatorEn();

  testWidgets('a failed file bubble offers Retry', (t) async {
    var retries = 0;
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: GroupPendingBubble(
            pending: const PendingGroupMessage(
              clientMessageId: 'c1',
              body: '',
              fileName: 'report.pdf',
              failed: true,
            ),
            onRetry: () => retries++,
            onDiscard: () {},
          ),
        ),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
      ),
    );
    await t.pump();
    await t.tap(find.text(en.t('error.retry')));
    expect(retries, 1);
  });

  test('Retry sends an uploaded file again with the same file and id',
      () async {
    final repo = FakeGroupRepository()
      ..refuseSend = const ApiException(
        code: 'NETWORK',
        message: 'offline',
      );
    final c = ProviderContainer(
      overrides: [
        groupRepositoryProvider.overrideWithValue(repo),
        realtimeClientProvider.overrideWithValue(null),
        ...uploadQueueOverrides(uploader: FakeStorageUploader()),
      ],
    );
    addTearDown(c.dispose);
    const key = (groupId: 'g1', topicId: null);
    final sub = c.listen(groupThreadProvider(key), (_, __) {});
    addTearDown(sub.close);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    final thread = c.read(groupThreadProvider(key).notifier);
    await thread.sendAttachment(
      fileId: 'file-9',
      fileName: 'report.pdf',
      caption: 'see this',
    );
    final failed = c.read(groupThreadProvider(key)).pending.single;
    expect(failed.failed, isTrue);

    repo.refuseSend = null;
    await thread.retry(failed.clientMessageId);
    final sent = repo.sentBodies.last;
    expect(sent.type, api.SendGroupMessageDtoType.attachment);
    expect(sent.fileId, 'file-9');
    expect(sent.fileName, 'report.pdf');
    expect(sent.body, 'see this');
    expect(sent.clientMessageId, failed.clientMessageId);
    expect(c.read(groupThreadProvider(key)).pending, isEmpty);
  });
}
