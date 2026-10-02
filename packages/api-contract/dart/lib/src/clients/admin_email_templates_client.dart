// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/email_template_content_dto.dart';
import '../models/email_template_detail_envelope.dart';
import '../models/email_template_preview_envelope.dart';
import '../models/email_template_summary_list_envelope.dart';
import '../models/email_template_test_result_envelope.dart';
import '../models/key.dart';
import '../models/locale.dart';
import '../models/save_email_template_dto.dart';
import '../models/test_email_template_dto.dart';

part 'admin_email_templates_client.g.dart';

@RestApi()
abstract class AdminEmailTemplatesClient {
  factory AdminEmailTemplatesClient(Dio dio, {String? baseUrl}) =
      _AdminEmailTemplatesClient;

  /// Catalog of emails with override status per locale
  @GET('/admin/email-templates')
  Future<EmailTemplateSummaryListEnvelope> listEmailTemplates({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Built-in email (sample values) and the override
  @GET('/admin/email-templates/{key}/{locale}')
  Future<EmailTemplateDetailEnvelope> getEmailTemplate({
    @Path('key') required Key key,
    @Path('locale') required Locale locale,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save the override (sign-in/verification emails must keep {{code}})
  @PUT('/admin/email-templates/{key}/{locale}')
  Future<EmailTemplateDetailEnvelope> saveEmailTemplate({
    @Path('key') required Key key,
    @Path('locale') required Locale locale,
    @Body() required SaveEmailTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reset to the built-in email (removes the override)
  @DELETE('/admin/email-templates/{key}/{locale}')
  Future<void> resetEmailTemplate({
    @Path('key') required Key key,
    @Path('locale') required Locale locale,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Render the given text with sample values
  @POST('/admin/email-templates/{key}/{locale}/preview')
  Future<EmailTemplatePreviewEnvelope> previewEmailTemplate({
    @Path('key') required Key key,
    @Path('locale') required Locale locale,
    @Body() required EmailTemplateContentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Send the email (given text, else saved override, else built-in) to my own address — 10/hour
  @POST('/admin/email-templates/{key}/{locale}/test')
  Future<EmailTemplateTestResultEnvelope> testEmailTemplate({
    @Path('key') required Key key,
    @Path('locale') required Locale locale,
    @Body() required TestEmailTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
