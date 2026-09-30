// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_budget_dto.dart';
import 'case_photo_dto.dart';
import 'case_practice_area_dto.dart';
import 'case_status.dart';

part 'case_detail_for_attorney_dto.g.dart';

@JsonSerializable()
class CaseDetailForAttorneyDto {
  const CaseDetailForAttorneyDto({
    required this.id,
    required this.title,
    required this.excerpt,
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
    required this.commentCount,
    required this.shareCount,
    required this.isSaved,
    required this.description,
    required this.photos,
    required this.photosCount,
    this.city,
    this.ownBidId,
  });

  factory CaseDetailForAttorneyDto.fromJson(Map<String, Object?> json) =>
      _$CaseDetailForAttorneyDtoFromJson(json);

  final String id;
  final String title;

  /// Owner 2026-09-30: first ~180 characters of the description.
  final String excerpt;
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

  /// Owner 2026-09-30 (OQ-034): the case card works like a post card.
  final int commentCount;

  /// OQ-037.
  final int shareCount;

  /// In the viewer's saved items.
  final bool isSaved;
  final String description;

  /// The attorney's own bid on this case (§4.3: shown instead of "Сделать бид").
  final String? ownBidId;

  /// OQ-031: photos — only when THIS attorney's bid was accepted.
  final List<CasePhotoDto> photos;

  /// OQ-031: how many photos the case has (shown to every attorney).
  final num photosCount;

  Map<String, Object?> toJson() => _$CaseDetailForAttorneyDtoToJson(this);
}
