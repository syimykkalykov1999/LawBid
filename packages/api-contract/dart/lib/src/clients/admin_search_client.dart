// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/add_synonym_term_dto.dart';
import '../models/create_synonym_group_dto.dart';
import '../models/import_synonyms_dto.dart';
import '../models/import_synonyms_result_envelope.dart';
import '../models/search_learned_link_list_envelope.dart';
import '../models/search_overview_envelope.dart';
import '../models/search_query_stat_list_envelope.dart';
import '../models/synonym_group_envelope.dart';
import '../models/synonym_group_list_envelope.dart';
import '../models/synonym_test_envelope.dart';
import '../models/update_synonym_group_dto.dart';

part 'admin_search_client.g.dart';

@RestApi()
abstract class AdminSearchClient {
  factory AdminSearchClient(Dio dio, {String? baseUrl}) = _AdminSearchClient;

  /// Synonym groups with their phrases.
  ///
  /// [q] - Part of a key or of a phrase.
  ///
  /// [lang] - Only groups with a phrase in this language.
  @GET('/admin/search/synonyms')
  Future<SynonymGroupListEnvelope> listSynonyms({
    @Query('q') String? q,
    @Query('lang') String? lang,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a group of words (live at once)
  @POST('/admin/search/synonyms')
  Future<SynonymGroupEnvelope> createSynonym({
    @Body() required CreateSynonymGroupDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// What a search for this text would understand
  @GET('/admin/search/synonyms/test')
  Future<SynonymTestEnvelope> testSynonyms({
    @Query('q') required String q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Bulk add groups and phrases (the multilingual dictionary file)
  @POST('/admin/search/synonyms/import')
  Future<ImportSynonymsResultEnvelope> importSynonyms({
    @Body() required ImportSynonymsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change a group: topic, on/off, its phrases
  @PATCH('/admin/search/synonyms/{id}')
  Future<SynonymGroupEnvelope> updateSynonym({
    @Path('id') required String id,
    @Body() required UpdateSynonymGroupDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a group with its phrases
  @DELETE('/admin/search/synonyms/{id}')
  Future<void> removeSynonym({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add one phrase to a group
  @POST('/admin/search/synonyms/{id}/terms')
  Future<SynonymGroupEnvelope> addSynonymTerm({
    @Path('id') required String id,
    @Body() required AddSynonymTermDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Queries, empty ones and opened results
  @GET('/admin/search/overview')
  Future<SearchOverviewEnvelope> searchOverview({
    @Query('days') num? days = 7,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Queries that found nothing, most frequent first
  @GET('/admin/search/no-results')
  Future<SearchQueryStatListEnvelope> searchNoResults({
    @Query('days') num? days = 7,
    @Extras() Map<String, dynamic>? extras,
  });

  /// What people search for most
  @GET('/admin/search/top')
  Future<SearchQueryStatListEnvelope> searchTop({
    @Query('days') num? days = 7,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Query → topic links learned from clicks
  @GET('/admin/search/learned')
  Future<SearchLearnedLinkListEnvelope> searchLearned({
    @Extras() Map<String, dynamic>? extras,
  });
}
