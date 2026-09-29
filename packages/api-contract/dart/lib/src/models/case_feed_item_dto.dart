// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_budget_dto.dart';
import 'case_practice_area_dto.dart';
import 'case_status.dart';

part 'case_feed_item_dto.g.dart';

@JsonSerializable()
class CaseFeedItemDto {
  const CaseFeedItemDto({
    required this.id,
    required this.title,
    required this.practiceArea,
    required this.primaryStateCode,
    required this.additionalStateCodes,
    required this.status,
    required this.budget,
    required this.viewCount,
    required this.bidsCount,
    required this.createdAt,
    required this.isNew,
    required this.hasOwnBid,
    this.city,
  });

  factory CaseFeedItemDto.fromJson(Map<String, Object?> json) =>
      _$CaseFeedItemDtoFromJson(json);

  final String id;
  final String title;
  final CasePracticeAreaDto practiceArea;
  final String primaryStateCode;
  final List<String> additionalStateCodes;
  final String? city;
  final CaseStatus status;
  final CaseBudgetDto budget;
  final int viewCount;
  final int bidsCount;
  final DateTime createdAt;

  /// Younger than CASE_NEW_BADGE_HOURS (§4.2).
  final bool isNew;

  /// "Вы сделали бид" (§4.2/§4.3).
  final bool hasOwnBid;

  Map<String, Object?> toJson() => _$CaseFeedItemDtoToJson(this);
}
