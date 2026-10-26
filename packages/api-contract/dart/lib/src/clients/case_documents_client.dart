// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/build_document_dto.dart';
import '../models/built_document_envelope.dart';
import '../models/case_form_templates_envelope.dart';

part 'case_documents_client.g.dart';

@RestApi()
abstract class CaseDocumentsClient {
  factory CaseDocumentsClient(Dio dio, {String? baseUrl}) =
      _CaseDocumentsClient;

  /// Published templates with their fields, and what the app prefills
  @GET('/cases/{id}/documents/templates')
  Future<CaseFormTemplatesEnvelope> listFormTemplates({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: fill a template and get a PDF in the case files
  @POST('/cases/{id}/documents/build')
  Future<BuiltDocumentEnvelope> buildDocument({
    @Path('id') required String id,
    @Body() required BuildDocumentDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
