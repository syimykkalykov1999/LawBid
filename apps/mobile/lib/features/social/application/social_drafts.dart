import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

SharedPreferences? _prefs(Ref ref) {
  try {
    return ref.read(sharedPreferencesProvider);
  } on Object {
    // No device storage (a test without it): kept in memory only.
    return null;
  }
}

/// Row 109 (Instagram, X, Threads «Save draft»): the caption, place and
/// topic of a new post the person left with «Save draft»; the next «New
/// post» opens with them. Per account, on the device.
class PostComposeDraft {
  const PostComposeDraft({
    this.body = '',
    this.place = '',
    this.practice,
    this.news = false,
  });

  factory PostComposeDraft.fromJson(Map<String, dynamic> j) => PostComposeDraft(
        body: j['body'] as String? ?? '',
        place: j['place'] as String? ?? '',
        practice: j['practice'] as String?,
        news: j['news'] as bool? ?? false,
      );

  final String body;
  final String place;
  final String? practice;
  final bool news;

  bool get isEmpty =>
      body.trim().isEmpty && place.trim().isEmpty && practice == null;

  Map<String, dynamic> toJson() => {
        'body': body,
        'place': place,
        if (practice != null) 'practice': practice,
        'news': news,
      };
}

class PostComposeDrafts {
  PostComposeDrafts(this._ref);

  final Ref _ref;

  String get _key => 'post.composeDraft.v1.${_ref.read(currentUserIdProvider)}';

  PostComposeDraft? load() {
    final raw = _prefs(_ref)?.getString(_key);
    if (raw == null) return null;
    try {
      final j = jsonDecode(raw);
      if (j is! Map<String, dynamic>) return null;
      final d = PostComposeDraft.fromJson(j);
      return d.isEmpty ? null : d;
    } on FormatException {
      return null;
    }
  }

  Future<void> save(PostComposeDraft d) async {
    final prefs = _prefs(_ref);
    if (prefs == null) return;
    if (d.isEmpty) return clear();
    await prefs.setString(_key, jsonEncode(d.toJson()));
  }

  Future<void> clear() async => _prefs(_ref)?.remove(_key);
}

final postComposeDraftsProvider =
    Provider<PostComposeDrafts>(PostComposeDrafts.new);

/// Row 109 (Instagram, YouTube): a half-typed comment stays with its post
/// while the app runs — closing the comments and opening them again brings
/// it back. In memory only, per account.
class CommentDrafts extends Notifier<Map<String, String>> {
  @override
  Map<String, String> build() {
    ref.watch(currentUserIdProvider);
    return const {};
  }

  String? of(String postId) => state[postId];

  /// A blank [text] drops the draft.
  void set(String postId, String text) {
    if (text.trim().isEmpty) {
      if (!state.containsKey(postId)) return;
      state = {...state}..remove(postId);
      return;
    }
    if (state[postId] == text) return;
    state = {...state, postId: text};
  }
}

final commentDraftsProvider =
    NotifierProvider<CommentDrafts, Map<String, String>>(CommentDrafts.new);

/// Row 109 (Instagram «Undo» after deleting a comment): comments deleted in
/// this session, hidden at once; the server is asked when the undo window
/// ends (and not at all when «Undo» was tapped).
class DeletedComments extends Notifier<Set<String>> {
  @override
  Set<String> build() {
    ref.watch(currentUserIdProvider);
    return const {};
  }

  void add(String id) => state = {...state, id};

  void remove(String id) => state = {...state}..remove(id);
}

final deletedCommentsProvider =
    NotifierProvider<DeletedComments, Set<String>>(DeletedComments.new);

/// Row 112 (Instagram, X, TikTok «Not interested»): posts the person hid
/// from their feed, kept on the device for `client.not_interested_keep_days`
/// (per account). They join [deletedPostsProvider], so every list skips
/// them without a new request.
class NotInterestedPosts extends Notifier<Map<String, int>> {
  String get _key => 'post.notInterested.v1.${ref.read(currentUserIdProvider)}';

  @override
  Map<String, int> build() {
    ref.watch(currentUserIdProvider);
    final raw = _prefs(ref)?.getString(_key);
    if (raw == null) return const {};
    try {
      final j = jsonDecode(raw);
      if (j is! Map) return const {};
      final oldest = DateTime.now()
          .subtract(ClientTuning.notInterestedKeep)
          .millisecondsSinceEpoch;
      return {
        for (final e in j.entries)
          if (e.key is String && e.value is int && (e.value as int) >= oldest)
            e.key as String: e.value as int,
      };
    } on FormatException {
      return const {};
    }
  }

  void add(String postId) {
    state = {...state, postId: DateTime.now().millisecondsSinceEpoch};
    ref.read(deletedPostsProvider.notifier).add(postId);
    _write();
  }

  void remove(String postId) {
    state = {...state}..remove(postId);
    ref.read(deletedPostsProvider.notifier).remove(postId);
    _write();
  }

  void _write() {
    final prefs = _prefs(ref);
    if (prefs == null) return;
    unawaited(
      (state.isEmpty
              ? prefs.remove(_key)
              : prefs.setString(_key, jsonEncode(state)))
          .catchError((Object _) => false),
    );
  }
}

final notInterestedPostsProvider =
    NotifierProvider<NotInterestedPosts, Map<String, int>>(
  NotInterestedPosts.new,
);
