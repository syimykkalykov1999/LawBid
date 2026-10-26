// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_support_user_summary_dto.g.dart';

@JsonSerializable()
class AdminSupportUserSummaryDto {
  const AdminSupportUserSummaryDto({
    required this.id,
    required this.name,
    required this.status,
    required this.uiLanguage,
    required this.hasEmail,
    required this.hasPhone,
    required this.createdAt,
    this.username,
    this.role,
    this.subscriptionActive,
  });

  factory AdminSupportUserSummaryDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportUserSummaryDtoFromJson(json);

  final String id;
  final String name;
  final String? username;
  final String? role;
  final String status;
  final String uiLanguage;

  /// Has a verified email (the address itself: GET /admin/users/:id/contacts with X-Justification).
  final bool hasEmail;

  /// Has a verified phone (see hasEmail).
  final bool hasPhone;

  /// Attorneys only (SubscriptionAccessService); null otherwise.
  final bool? subscriptionActive;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminSupportUserSummaryDtoToJson(this);
}
