import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-21: the «Calls» tab — read only. Throws [ApiException].
abstract interface class CallHistoryRepository {
  /// My finished calls, newest first; [cursor] null = the first page.
  Future<CursorPage<CallHistoryEntry>> history({String? cursor, int? limit});

  /// Group calls running now in my groups.
  Future<List<OngoingGroupCall>> ongoing();
}

class ApiCallHistoryRepository implements CallHistoryRepository {
  ApiCallHistoryRepository(Dio dio) : _api = api.CallsClient(dio);

  final api.CallsClient _api;

  @override
  Future<CursorPage<CallHistoryEntry>> history({
    String? cursor,
    int? limit,
  }) async {
    final env = await guardApiCall(
      () => _api.callHistory(cursor: cursor, limit: limit),
    );
    return CursorPage(
      items: [for (final d in env.data) _entry(d)],
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<List<OngoingGroupCall>> ongoing() async {
    final env = await guardApiCall(_api.ongoingGroupCalls);
    return [
      for (final d in env.data)
        OngoingGroupCall(
          id: d.id,
          groupId: d.groupId,
          groupTitle: d.groupTitle,
          groupAvatarUrl: d.groupAvatarUrl,
          video: d.video,
          joined: d.joined,
          mine: d.mine,
        ),
    ];
  }

  CallHistoryEntry _entry(api.CallHistoryItemDto d) => CallHistoryEntry(
        id: d.id,
        status: _status(d.status),
        outgoing: d.outgoing,
        video: d.video,
        peer: CallPeer(
          id: d.peer.id,
          isAttorney: d.peer.kind == api.CallPeerDtoKind.attorney,
          displayName: d.peer.displayName,
          username: d.peer.username,
          avatarUrl: d.peer.avatarUrl,
        ),
        createdAt: d.createdAt,
        conversationId: d.conversationId,
        groupId: d.groupId,
        groupTitle: d.groupTitle,
        groupAvatarUrl: d.groupAvatarUrl,
        durationSec: d.durationSec,
      );

  CallStatus _status(api.CallHistoryStatus s) => switch (s) {
        api.CallHistoryStatus.ended => CallStatus.ended,
        api.CallHistoryStatus.missed => CallStatus.missed,
        api.CallHistoryStatus.declined => CallStatus.declined,
        api.CallHistoryStatus.busy => CallStatus.busy,
        api.CallHistoryStatus.canceled => CallStatus.canceled,
        api.CallHistoryStatus.failed ||
        api.CallHistoryStatus.$unknown =>
          CallStatus.failed,
      };
}
