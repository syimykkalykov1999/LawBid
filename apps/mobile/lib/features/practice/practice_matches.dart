import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-15: practices whose name in any language starts with the
/// typed text (code → the matching word when not the English name) — the
/// topic pickers find "divorce", "развод" and "ажырашуу" alike. Lives in
/// the practice feature so every picker reads it without depending on
/// Search.
final practiceMatchesProvider = FutureProvider.autoDispose
    .family<Map<String, String?>, String>((ref, q) async {
  final text = q.trim();
  if (text.length < 2) return const {};
  final client = api.SearchClient(ref.watch(dioProvider));
  final env = await guardApiCall(() => client.practices(q: text));
  return {for (final m in env.data) m.code: m.hit};
});
