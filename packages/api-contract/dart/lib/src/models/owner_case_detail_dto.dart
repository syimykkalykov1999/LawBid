// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_mode.dart';
import 'case_bid_item_dto.dart';
import 'case_state_dto.dart';
import 'case_status.dart';
import 'practice_area_ref_dto.dart';

part 'owner_case_detail_dto.g.dart';

@JsonSerializable()
class OwnerCaseDetailDto {
  const OwnerCaseDetailDto({
    required this.id,
    required this.title,
    required this.description,
    required this.practiceArea,
    required this.primaryStateCode,
    required this.states,
    required this.budgetMode,
    required this.status,
    required this.viewCount,
    required this.bidsCount,
    required this.createdAt,
    required this.lastActivityAt,
    this.city,
    this.budgetCents,
    this.archivedAt,
    this.clientCompletedAt,
    this.attorneyConfirmedAt,
    this.autoCloseAt,
    this.closedAt,
    this.deletedAt,
    this.acceptedBid,
    this.conversationId,
  });

  factory OwnerCaseDetailDto.fromJson(Map<String, Object?> json) =>
      _$OwnerCaseDetailDtoFromJson(json);

  final String id;
  final String title;
  final String description;
  final PracticeAreaRefDto practiceArea;
  final String primaryStateCode;
  final List<CaseStateDto> states;
  final String? city;
  final BudgetMode budgetMode;
  final int? budgetCents;
  final CaseStatus status;
  final int viewCount;
  final int bidsCount;
  final String createdAt;
  final String lastActivityAt;
  final String? archivedAt;
  final String? clientCompletedAt;
  final String? attorneyConfirmedAt;
  final String? autoCloseAt;
  final String? closedAt;
  final String? deletedAt;
  final CaseBidItemDto? acceptedBid;

  /// Chat with the accepted attorney (docs/05).
  final String? conversationId;

  Map<String, Object?> toJson() => _$OwnerCaseDetailDtoToJson(this);
}
