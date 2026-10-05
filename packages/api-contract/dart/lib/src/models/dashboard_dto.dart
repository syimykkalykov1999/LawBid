// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dashboard_new_users_dto.dart';
import 'dashboard_subscriptions_dto.dart';
import 'dashboard_verification_dto.dart';

part 'dashboard_dto.g.dart';

@JsonSerializable()
class DashboardDto {
  const DashboardDto({
    required this.newUsers,
    required this.verification,
    required this.subscriptions,
    required this.openCases,
    required this.bids24h,
    required this.invites24h,
    required this.openReports,
    required this.openDisputes,
    required this.openContactIssues,
    required this.seatLimitRequests,
    required this.fraudQueue,
    required this.fraudBlocked7d,
    required this.computedAt,
  });

  factory DashboardDto.fromJson(Map<String, Object?> json) =>
      _$DashboardDtoFromJson(json);

  final DashboardNewUsersDto newUsers;
  final DashboardVerificationDto verification;
  final DashboardSubscriptionsDto subscriptions;
  final int openCases;
  final int bids24h;

  /// Owner 2026-10-05: client → attorney case invites sent.
  final int invites24h;
  final int openReports;
  final int openDisputes;
  final int openContactIssues;

  /// Owner 2026-10-05: requests for more assistant seats.
  final int seatLimitRequests;

  /// Owner 2026-10-05 (client fraud): accounts waiting for a check or restricted.
  final int fraudQueue;

  /// Owner 2026-10-05: blocked fraudsters refused at sign-in + accounts blocked automatically, 7 days.
  final int fraudBlocked7d;

  /// When the numbers were computed (cached ≤ 60 s).
  final DateTime computedAt;

  Map<String, Object?> toJson() => _$DashboardDtoToJson(this);
}
