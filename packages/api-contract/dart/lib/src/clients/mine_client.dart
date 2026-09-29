// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_conversation_envelope.dart';
import '../models/filter2.dart';
import '../models/filter3.dart';
import '../models/my_bid_item_list_envelope.dart';
import '../models/owner_case_detail_envelope.dart';
import '../models/saved_case_item_list_envelope.dart';
import '../models/type.dart';
import '../models/work_item_list_envelope.dart';

part 'mine_client.g.dart';

@RestApi()
abstract class MineClient {
  factory MineClient(Dio dio, {String? baseUrl}) = _MineClient;

  /// Saved cases (docs/04 §11.2 "Сохранённое").
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [type] - Posts arrive with docs/05.
  @GET('/saved-items')
  Future<SavedCaseItemListEnvelope> listSavedItems({
    @Query('type') required Type type,
    @Query('limit') num? limit = 20,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner's case detail (docs/04 §11.1)
  @GET('/users/me/cases/{id}')
  Future<OwnerCaseDetailEnvelope> getMyCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "My bids" (attorney, docs/04 §11.2).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/users/me/bids')
  Future<MyBidItemListEnvelope> listMyBids({
    @Query('limit') num? limit = 20,
    @Query('filter') Filter2? filter = Filter2.active,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "In progress" / "Completed" (attorney, §11.2).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/users/me/work')
  Future<WorkItemListEnvelope> listMyWork({
    @Query('limit') num? limit = 20,
    @Query('filter') Filter3? filter = Filter3.active,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "Message the client" (attorney, docs/04 §9)
  @POST('/cases/{id}/conversation')
  Future<CaseConversationEnvelope> openCaseConversation({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
