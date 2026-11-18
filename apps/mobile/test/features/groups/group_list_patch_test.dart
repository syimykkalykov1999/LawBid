import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import 'fake_group_repository.dart';

/// Verify 17.11: the group list row from a live message.
void main() {
  test('the preview message deleted for everyone replaces the preview', () {
    final g = listGroup('g1', unread: 2);
    final gone = api.GroupMessageDto.fromJson({
      ...g.lastMessage!.toJson(),
      'deleted': true,
      'body': '',
    });
    final out = applyGroupMessage(g, gone);
    expect(out.lastMessage!.deleted, isTrue);
    expect(out.lastMessage!.body, '');
    expect(out.unreadCount, 2, reason: 'not a new unread');
  });

  test('a service line is not an unread message', () {
    final g = listGroup('g1');
    final joined = message(
      'sys-1',
      body: '',
      type: api.GroupMessageDtoType.system,
      minutes: 60 * 24 * 365,
    );
    final out = applyGroupMessage(g, joined);
    expect(out.lastMessage!.id, 'sys-1');
    expect(out.unreadCount, g.unreadCount);
  });

  test("someone else's new text message still adds one unread", () {
    final g = listGroup('g1');
    final out = applyGroupMessage(
      g,
      message('m-2', body: 'hi', minutes: 60 * 24 * 365),
    );
    expect(out.unreadCount, g.unreadCount + 1);
  });
}
