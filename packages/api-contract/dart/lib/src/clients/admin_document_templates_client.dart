// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_bulk_result_envelope.dart';
import '../models/admin_document_template_envelope.dart';
import '../models/admin_document_template_list_envelope.dart';
import '../models/admin_template_upload_dto.dart';
import '../models/admin_templates_bulk_dto.dart';
import '../models/create_document_template_dto.dart';
import '../models/file_envelope.dart';
import '../models/presigned_file_envelope.dart';
import '../models/template_sort.dart';
import '../models/update_document_template_dto.dart';

part 'admin_document_templates_client.g.dart';

@RestApi()
abstract class AdminDocumentTemplatesClient {
  factory AdminDocumentTemplatesClient(Dio dio, {String? baseUrl}) =
      _AdminDocumentTemplatesClient;

  /// Templates (drafts and published), newest first.
  ///
  /// [q] - Search in title and description.
  ///
  /// [state] - Two-letter state; templates for every state are included.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [published] - true = published, false = drafts.
  @GET('/admin/document-templates')
  Future<AdminDocumentTemplateListEnvelope> listAdminDocumentTemplates({
    @Query('q') String? q,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
    @Query('language') String? language,
    @Query('sort') TemplateSort? sort,
    @Query('cursor') String? cursor,
    @Query('published') bool? published,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a template from an uploaded (clean) file
  @POST('/admin/document-templates')
  Future<AdminDocumentTemplateEnvelope> createAdminDocumentTemplate({
    @Body() required CreateDocumentTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Publish, unpublish or delete many templates
  @POST('/admin/document-templates/bulk')
  Future<AdminBulkResultEnvelope> bulkAdminDocumentTemplates({
    @Body() required AdminTemplatesBulkDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Step 1 of a template upload (PDF, Word): presigned POST (then POST the file to S3)
  @POST('/admin/document-templates/uploads')
  Future<PresignedFileEnvelope> presignAdminTemplateUpload({
    @Body() required AdminTemplateUploadDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Step 2: verify the uploaded file; usable once scanStatus = clean
  @POST('/admin/document-templates/uploads/{fileId}/confirm')
  Future<FileEnvelope> confirmAdminTemplateUpload({
    @Path('fileId') required String fileId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One template
  @GET('/admin/document-templates/{id}')
  Future<AdminDocumentTemplateEnvelope> getAdminDocumentTemplate({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a template (any field, or replace the document)
  @PATCH('/admin/document-templates/{id}')
  Future<AdminDocumentTemplateEnvelope> updateAdminDocumentTemplate({
    @Path('id') required String id,
    @Body() required UpdateDocumentTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a template (copies users made stay)
  @DELETE('/admin/document-templates/{id}')
  Future<void> deleteAdminDocumentTemplate({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
