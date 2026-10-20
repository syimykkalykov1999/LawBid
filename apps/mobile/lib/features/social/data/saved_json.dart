import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';

/// Owner 2026-10-20 (speed, Telegram / Instagram): the one way the app keeps
/// "the last answer" of a screen on the phone — the same table as the feed
/// copy ([SocialLocalDatabase.cachedPages]), one row per account and name.
/// The chat list and the own profile use it, so there is a single scheme.
///
/// A saved copy is only ever shown first and then replaced by the live
/// answer; it is never the source of truth. Writes are not awaited (the
/// screen is not held for the disk); a failed write or an unreadable copy
/// is just "no copy".
class SavedJson {
  const SavedJson(this._local, this._ownerId);

  final SocialLocalDatabase _local;
  final String? _ownerId;

  String? _key(String name) => _ownerId == null ? null : '$name:$_ownerId';

  void save(String name, Map<String, dynamic> json) {
    final key = _key(name);
    if (key == null) return;
    _local
        .savePage(key, jsonEncode(json))
        .catchError((Object e) => debugPrint('saved $name write: $e'));
  }

  Future<Map<String, dynamic>?> read(String name) async {
    final key = _key(name);
    if (key == null) return null;
    try {
      final json = await _local.pageJson(key);
      if (json == null) return null;
      return jsonDecode(json) as Map<String, dynamic>;
    } on Object {
      return null;
    }
  }
}
