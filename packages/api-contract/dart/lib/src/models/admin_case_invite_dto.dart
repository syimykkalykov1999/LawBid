// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_case_invite_dto.g.dart';

@JsonSerializable()
class AdminCaseInviteDto {
  const AdminCaseInviteDto({
    required this.id,
    required this.attorneyId,
    required this.attorneyName,
    required this.status,
    required this.budgetCents,
    required this.declineReason,
    required this.bidId,
    required this.expiresAt,
    required this.createdAt,
  });

  factory AdminCaseInviteDto.fromJson(Map<String, Object?> json) =>
      _$AdminCaseInviteDtoFromJson(json);

  final String id;
  final String attorneyId;
  final String attorneyName;

  /// pending / accepted / declined / cancelled / expired / closed
  final String status;
  final int? budgetCents;
  final String? declineReason;
  final String? bidId;
  final DateTime expiresAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminCaseInviteDtoToJson(this);
}
