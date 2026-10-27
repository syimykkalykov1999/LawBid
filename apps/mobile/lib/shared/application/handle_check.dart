import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';

/// What `GET /usernames/check` said about one @username.
class HandleVerdict {
  const HandleVerdict({
    required this.available,
    this.reason,
    this.suggestions = const [],
  });

  final bool available;

  /// invalid · reserved · taken · held · similar (null when available).
  final String? reason;
  final List<String> suggestions;
}

/// kind: channel | group | user. `id` is the channel / group being edited, so
/// its own @username reads as free.
typedef HandleQuery = ({String u, String kind, String? title, String? id});

/// Owner 2026-10-20 (Telegram): the live «is this @username free?» of the
/// channel and group forms; the server owns every rule.
final handleCheckProvider =
    FutureProvider.autoDispose.family<HandleVerdict, HandleQuery>((
  ref,
  q,
) async {
  final res = await ref.watch(dioProvider).get<Map<String, dynamic>>(
    '/usernames/check',
    queryParameters: {
      'u': q.u,
      'kind': q.kind,
      if (q.title?.trim().isNotEmpty ?? false) 'title': q.title!.trim(),
      if (q.id != null) 'id': q.id,
    },
  );
  final d = res.data?['data'] as Map<String, dynamic>? ?? const {};
  final s = d['suggestions'];
  return HandleVerdict(
    available: d['available'] == true,
    reason: d['reason'] as String?,
    suggestions: s is List ? s.whereType<String>().toList() : const [],
  );
});
