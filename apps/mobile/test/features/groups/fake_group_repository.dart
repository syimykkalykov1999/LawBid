import 'package:lawbid/features/groups/data/group_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// A group repository for widget tests of the Chats list: one page of
/// [items], and the pin / mute / hide calls recorded in [updates].
class FakeGroupRepository implements GroupRepository {
  FakeGroupRepository([this.items = const []]);

  final List<api.GroupDto> items;
  final updates = <String>[];

  @override
  Future<CursorPage<api.GroupDto>> groups({String? cursor}) async =>
      CursorPage(items: items);

  @override
  Future<api.GroupDto> updateMine(String id, api.UpdateGroupMeDto body) async {
    updates.add(
      '$id:pinned=${body.pinned}:hidden=${body.hidden}:'
      'muted=${body.mutedUntil != null}',
    );
    return items.firstWhere((g) => g.id == id);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}
