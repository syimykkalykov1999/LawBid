// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/contact_issue_resolution_envelope.dart';
import '../models/resolve_contact_issue_dto.dart';

part 'admin_contact_issues_client.g.dart';

@RestApi()
abstract class AdminContactIssuesClient {
  factory AdminContactIssuesClient(Dio dio, {String? baseUrl}) =
      _AdminContactIssuesClient;

  /// Confirm or reject a contact-issue report; the threshold suspends the client (docs/04 §8.4)
  @POST('/admin/contact-issues/{id}/resolve')
  Future<ContactIssueResolutionEnvelope> resolveContactIssue({
    @Path('id') required String id,
    @Body() required ResolveContactIssueDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
