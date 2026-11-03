import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-11-02: a ready-made answer the attorney inserts into a chat.
@immutable
class QuickReply {
  const QuickReply({required this.id, required this.title, required this.body});

  QuickReply.fromDto(api.QuickReplyDto d)
      : this(id: d.id, title: d.title, body: d.body);

  final String id;
  final String title;
  final String body;

  /// The picker's search: the name or the text, case-insensitive.
  bool matches(String query) {
    final q = query.trim().toLowerCase();
    return q.isEmpty ||
        title.toLowerCase().contains(q) ||
        body.toLowerCase().contains(q);
  }
}

class QuickRepliesRepository {
  QuickRepliesRepository(Dio dio) : _client = api.QuickRepliesClient(dio);

  final api.QuickRepliesClient _client;

  Future<List<QuickReply>> list() async => [
        for (final d
            in (await guardApiCall(_client.listQuickReplies)).data.items)
          QuickReply.fromDto(d),
      ];

  Future<QuickReply> create(String title, String body) async =>
      QuickReply.fromDto(
        (await guardApiCall(
          () => _client.createQuickReply(
            body: api.QuickReplyInputDto(title: title, body: body),
          ),
        ))
            .data,
      );

  Future<QuickReply> update(String id, String title, String body) async =>
      QuickReply.fromDto(
        (await guardApiCall(
          () => _client.updateQuickReply(
            id: id,
            body: api.QuickReplyInputDto(title: title, body: body),
          ),
        ))
            .data,
      );

  Future<void> delete(String id) =>
      guardApiCall(() => _client.deleteQuickReply(id: id));
}

final quickRepliesRepositoryProvider = Provider<QuickRepliesRepository>(
  (ref) => QuickRepliesRepository(ref.watch(dioProvider)),
);
