// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_attorney_card_dto.dart';
import 'admin_client_card_dto.dart';
import 'admin_user_bid_dto.dart';
import 'admin_user_case_dto.dart';
import 'admin_user_session_dto.dart';

part 'admin_user_card_dto.g.dart';

@JsonSerializable()
class AdminUserCardDto {
  const AdminUserCardDto({
    required this.id,
    required this.role,
    required this.status,
    required this.suspendedReason,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.uiLanguage,
    required this.hasEmail,
    required this.hasPhone,
    required this.createdAt,
    required this.deletedAt,
    required this.attorney,
    required this.client,
    required this.sessions,
    required this.cases,
    required this.bids,
    required this.warnings,
  });

  factory AdminUserCardDto.fromJson(Map<String, Object?> json) =>
      _$AdminUserCardDtoFromJson(json);

  final String id;
  final String? role;
  final String status;
  final String? suspendedReason;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final String uiLanguage;
  final bool hasEmail;
  final bool hasPhone;
  final DateTime createdAt;
  final DateTime? deletedAt;
  final AdminAttorneyCardDto? attorney;
  final AdminClientCardDto? client;
  final List<AdminUserSessionDto> sessions;

  /// Last 20 (client).
  final List<AdminUserCaseDto> cases;

  /// Last 20 (attorney).
  final List<AdminUserBidDto> bids;
  final int warnings;

  Map<String, Object?> toJson() => _$AdminUserCardDtoToJson(this);
}
