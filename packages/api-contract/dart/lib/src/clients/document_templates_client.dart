// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/copy_template_dto.dart';
import '../models/document_template_envelope.dart';
import '../models/document_template_list_envelope.dart';
import '../models/file_envelope.dart';
import '../models/template_download_envelope.dart';
import '../models/template_sort.dart';

part 'document_templates_client.g.dart';

@RestApi()
abstract class DocumentTemplatesClient {
  factory DocumentTemplatesClient(Dio dio, {String? baseUrl}) =
      _DocumentTemplatesClient;

  /// Published templates: search, practice area, state (every-state ones included), language.
  ///
  /// [q] - Search in title and description.
  ///
  /// [state] - Two-letter state; templates for every state are included.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/document-templates')
  Future<DocumentTemplateListEnvelope> listDocumentTemplates({
    @Query('q') String? q,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
    @Query('language') String? language,
    @Query('sort') TemplateSort? sort,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One published template
  @GET('/document-templates/{id}')
  Future<DocumentTemplateEnvelope> getDocumentTemplate({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A short signed download link (counted once per user a day)
  @POST('/document-templates/{id}/download')
  Future<TemplateDownloadEnvelope> downloadDocumentTemplate({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My own copy as a chat or case attachment (then send / attach it as usual)
  @POST('/document-templates/{id}/copy')
  Future<FileEnvelope> copyDocumentTemplate({
    @Path('id') required String id,
    @Body() required CopyTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
