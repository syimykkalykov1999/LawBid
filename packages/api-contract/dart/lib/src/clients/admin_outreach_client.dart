// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/outreach_activity_input_dto.dart';
import '../models/outreach_assign_dto.dart';
import '../models/outreach_assign_result_envelope.dart';
import '../models/outreach_assigned_filter.dart';
import '../models/outreach_context_envelope.dart';
import '../models/outreach_due_filter.dart';
import '../models/outreach_import_mode.dart';
import '../models/outreach_import_report_envelope.dart';
import '../models/outreach_lead_detail_envelope.dart';
import '../models/outreach_lead_input_dto.dart';
import '../models/outreach_lead_kind.dart';
import '../models/outreach_lead_row_list_envelope.dart';
import '../models/outreach_lead_status.dart';
import '../models/outreach_registry_import_dto.dart';
import '../models/outreach_send_email_dto.dart';
import '../models/outreach_send_email_result_envelope.dart';
import '../models/outreach_settings_dto.dart';
import '../models/outreach_settings_envelope.dart';
import '../models/outreach_stats_envelope.dart';
import '../models/outreach_suppressions_add_dto.dart';
import '../models/outreach_suppressions_add_result_envelope.dart';
import '../models/outreach_suppressions_envelope.dart';
import '../models/outreach_template_envelope.dart';
import '../models/outreach_template_input_dto.dart';
import '../models/outreach_template_list_envelope.dart';

part 'admin_outreach_client.g.dart';

@RestApi()
abstract class AdminOutreachClient {
  factory AdminOutreachClient(Dio dio, {String? baseUrl}) =
      _AdminOutreachClient;

  /// Who I am in outreach: scope, partners to assign, settings
  @GET('/admin/outreach/context')
  Future<OutreachContextEnvelope> outreachContext({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Email limits, sender name, postal address, public API URL, TCPA/DNC rules, retention
  @PUT('/admin/outreach/settings')
  Future<OutreachSettingsEnvelope> outreachUpdateSettings({
    @Body() required OutreachSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Per employee: leads, calls, emails, answers, registrations, payments, commissions.
  ///
  /// [from] - Default: 30 days ago.
  ///
  /// [to] - Default: now.
  @GET('/admin/outreach/stats')
  Future<OutreachStatsEnvelope> outreachStats({
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Leads, newest first (an employee sees their own).
  ///
  /// [partnerId] - Assigned partner.
  ///
  /// [assigned] - "none" = unassigned leads only.
  ///
  /// [q] - Name, company, email or phone.
  ///
  /// [due] - Leads due for a follow-up by now.
  @GET('/admin/outreach/leads')
  Future<OutreachLeadRowListEnvelope> outreachListLeads({
    @Query('status') OutreachLeadStatus? status,
    @Query('kind') OutreachLeadKind? kind,
    @Query('partnerId') String? partnerId,
    @Query('assigned') OutreachAssignedFilter? assigned,
    @Query('state') String? state,
    @Query('q') String? q,
    @Query('due') OutreachDueFilter? due,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add one lead by hand
  @POST('/admin/outreach/leads')
  Future<OutreachLeadDetailEnvelope> outreachCreateLead({
    @Body() required OutreachLeadInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Leads as CSV (managers).
  ///
  /// [partnerId] - Assigned partner.
  ///
  /// [assigned] - "none" = unassigned leads only.
  ///
  /// [q] - Name, company, email or phone.
  ///
  /// [due] - Leads due for a follow-up by now.
  @GET('/admin/outreach/leads/export.csv')
  Future<void> exportLeads({
    @Query('status') OutreachLeadStatus? status,
    @Query('kind') OutreachLeadKind? kind,
    @Query('partnerId') String? partnerId,
    @Query('assigned') OutreachAssignedFilter? assigned,
    @Query('state') String? state,
    @Query('q') String? q,
    @Query('due') OutreachDueFilter? due,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Import leads from a CSV export (dry-run by default).
  ///
  /// [partnerId] - Assign every new lead to this partner.
  ///
  /// [sourceNote] - Required for CSV: where the contacts come from and on what basis we may write; stored on every lead.
  ///
  /// [file] - CSV, ≤ 10 MB, ≤ 5000 rows; needs an email or phone column.
  @MultiPart()
  @POST('/admin/outreach/leads/import')
  Future<OutreachImportReportEnvelope> outreachImportCsv({
    @Part(name: 'file') required MultipartFile file,
    @Query('mode') OutreachImportMode? mode,
    @Query('kind') OutreachLeadKind? kind,
    @Query('partnerId') String? partnerId,
    @Query('sourceNote') String? sourceNote,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Import lawyers from a free public state registry (NY open data)
  @POST('/admin/outreach/leads/import-registry')
  Future<OutreachImportReportEnvelope> outreachImportRegistry({
    @Body() required OutreachRegistryImportDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Assign (or unassign) many leads to an employee
  @POST('/admin/outreach/leads/assign')
  Future<OutreachAssignResultEnvelope> outreachAssign({
    @Body() required OutreachAssignDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One lead with its activity log
  @GET('/admin/outreach/leads/{id}')
  Future<OutreachLeadDetailEnvelope> outreachLead({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a lead (fields, status, assignee)
  @PATCH('/admin/outreach/leads/{id}')
  Future<OutreachLeadDetailEnvelope> outreachUpdateLead({
    @Path('id') required String id,
    @Body() required OutreachLeadInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Log a call (with outcome) or a note
  @POST('/admin/outreach/leads/{id}/activities')
  Future<OutreachLeadDetailEnvelope> outreachAddActivity({
    @Path('id') required String id,
    @Body() required OutreachActivityInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Send one cold email from a template with the partner link
  @POST('/admin/outreach/leads/{id}/email')
  Future<OutreachSendEmailResultEnvelope> outreachSendEmail({
    @Path('id') required String id,
    @Body() required OutreachSendEmailDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop-list (do not call / write): count and the latest entries
  @GET('/admin/outreach/suppressions')
  Future<OutreachSuppressionsEnvelope> outreachSuppressions({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add phones / e-mails to the stop-list; matching leads become do-not-contact (managers)
  @POST('/admin/outreach/suppressions')
  Future<OutreachSuppressionsAddResultEnvelope> outreachAddSuppressions({
    @Body() required OutreachSuppressionsAddDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cold-email templates
  @GET('/admin/outreach/templates')
  Future<OutreachTemplateListEnvelope> outreachTemplates({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a template (managers)
  @POST('/admin/outreach/templates')
  Future<OutreachTemplateEnvelope> outreachCreateTemplate({
    @Body() required OutreachTemplateInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a template (managers)
  @PUT('/admin/outreach/templates/{id}')
  Future<OutreachTemplateEnvelope> outreachUpdateTemplate({
    @Path('id') required String id,
    @Body() required OutreachTemplateInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
