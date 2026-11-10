import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

/// Owner 2026-11-09: the cases-screen filter (stages, «Ждёт меня», the
/// date order) is remembered on this device per account — the screen
/// opens as it was left. Through [LocalKvStore], like the theme and the
/// language (the app's local-persistence pattern).
class CasesListFilterStore {
  const CasesListFilterStore(this._kv);

  final LocalKvStore _kv;

  static String _key(String userId) => 'cases.list_filter.$userId';

  /// The saved filter of [userId], or the default (nothing picked).
  MineSearch load(String userId) {
    final raw = _kv.getString(_key(userId));
    if (raw == null) return const MineSearch();
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final stages = (map['stages'] as List?)
              ?.whereType<num>()
              .map((n) => n.toInt())
              .where((n) => n >= 0 && n <= 4)
              .toSet() ??
          const <int>{};
      final sortName = map['sort'] as String?;
      return MineSearch(
        stages: stages,
        awaiting: map['awaiting'] == true,
        sort: CasesSort.values.firstWhere(
          (s) => s.name == sortName,
          orElse: () => CasesSort.stage,
        ),
      );
    } on Object {
      // A broken copy is just "no copy".
      return const MineSearch();
    }
  }

  /// Saves the cases-screen part of [search] (the text, the practice and
  /// the state are per visit and are not kept).
  Future<void> save(String userId, MineSearch search) {
    if (search.listFilterCount == 0) return _kv.remove(_key(userId));
    return _kv.setString(
      _key(userId),
      jsonEncode({
        'stages': search.stageList,
        'awaiting': search.awaiting,
        'sort': search.sort.name,
      }),
    );
  }
}

final casesListFilterStoreProvider = Provider<CasesListFilterStore>(
  (ref) => CasesListFilterStore(ref.watch(localKvStoreProvider)),
);
