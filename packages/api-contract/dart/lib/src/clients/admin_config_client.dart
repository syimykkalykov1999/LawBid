// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/config_entry_envelope.dart';
import '../models/config_entry_list_envelope.dart';
import '../models/create_legal_document_dto.dart';
import '../models/feature_flag_admin_envelope.dart';
import '../models/feature_flag_admin_list_envelope.dart';
import '../models/language_admin_envelope.dart';
import '../models/language_admin_list_envelope.dart';
import '../models/legal_document_admin_envelope.dart';
import '../models/legal_document_admin_list_envelope.dart';
import '../models/update_config_dto.dart';
import '../models/update_flag_dto.dart';
import '../models/update_language_dto.dart';

part 'admin_config_client.g.dart';

@RestApi()
abstract class AdminConfigClient {
  factory AdminConfigClient(Dio dio, {String? baseUrl}) = _AdminConfigClient;

  /// Feature flags with the paid-service key check
  @GET('/admin/feature-flags')
  Future<FeatureFlagAdminListEnvelope> listFeatureFlags({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Switch a flag / set the rollout percent (applies without a release)
  @PATCH('/admin/feature-flags/{key}')
  Future<FeatureFlagAdminEnvelope> updateFeatureFlag({
    @Path('key') required String key,
    @Body() required UpdateFlagDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// app_config keys with schema, defaults and current values
  @GET('/admin/config')
  Future<ConfigEntryListEnvelope> listAppConfig({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set a value (validated against the key schema)
  @PUT('/admin/config/{key}')
  Future<ConfigEntryEnvelope> updateAppConfig({
    @Path('key') required String key,
    @Body() required UpdateConfigDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// All languages (active and inactive) with translation counts
  @GET('/admin/i18n/languages')
  Future<LanguageAdminListEnvelope> listAdminLanguages({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Enable / disable a language, change its order
  @PATCH('/admin/i18n/languages/{code}')
  Future<LanguageAdminEnvelope> updateAdminLanguage({
    @Path('code') required String code,
    @Body() required UpdateLanguageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Every version of terms / privacy / disclaimer / client_contact_sharing
  @GET('/admin/legal-documents')
  Future<LegalDocumentAdminListEnvelope> listLegalDocuments({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a draft version
  @POST('/admin/legal-documents')
  Future<LegalDocumentAdminEnvelope> createLegalDocument({
    @Body() required CreateLegalDocumentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One version with the full text
  @GET('/admin/legal-documents/{id}')
  Future<LegalDocumentAdminEnvelope> getLegalDocument({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Make the version current: users re-accept on their next sign-in
  @POST('/admin/legal-documents/{id}/publish')
  Future<LegalDocumentAdminEnvelope> publishLegalDocument({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
