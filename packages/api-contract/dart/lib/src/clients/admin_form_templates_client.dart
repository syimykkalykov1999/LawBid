// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_form_template_envelope.dart';
import '../models/admin_form_template_list_envelope.dart';
import '../models/create_form_template_dto.dart';
import '../models/update_form_template_dto.dart';

part 'admin_form_templates_client.g.dart';

@RestApi()
abstract class AdminFormTemplatesClient {
  factory AdminFormTemplatesClient(Dio dio, {String? baseUrl}) =
      _AdminFormTemplatesClient;

  /// All form templates (drafts and published)
  @GET('/admin/form-templates')
  Future<AdminFormTemplateListEnvelope> listAdminFormTemplates({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a form template
  @POST('/admin/form-templates')
  Future<AdminFormTemplateEnvelope> createAdminFormTemplate({
    @Body() required CreateFormTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One form template
  @GET('/admin/form-templates/{id}')
  Future<AdminFormTemplateEnvelope> getAdminFormTemplate({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a form template (any field, publish)
  @PATCH('/admin/form-templates/{id}')
  Future<AdminFormTemplateEnvelope> updateAdminFormTemplate({
    @Path('id') required String id,
    @Body() required UpdateFormTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a form template (documents already built stay)
  @DELETE('/admin/form-templates/{id}')
  Future<void> deleteAdminFormTemplate({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
