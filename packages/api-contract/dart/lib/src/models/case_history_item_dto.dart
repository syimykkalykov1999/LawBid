// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_status.dart';
import 'history_accepted_bid_dto.dart';
import 'history_practice_area_dto.dart';

part 'case_history_item_dto.g.dart';

@JsonSerializable()
class CaseHistoryItemDto {
  const CaseHistoryItemDto({
    required this.id,
    required this.title,
    required this.practiceArea,
    required this.primaryStateCode,
    required this.status,
    required this.deleted,
    required this.createdAt,
    this.closedAt,
    this.archivedAt,
    this.acceptedBid,
  });

  factory CaseHistoryItemDto.fromJson(Map<String, Object?> json) =>
      _$CaseHistoryItemDtoFromJson(json);

  final String id;
  final String title;
  final HistoryPracticeAreaDto practiceArea;
  final String primaryStateCode;

  /// Final status of the case.
  final CaseStatus status;

  /// The case was deleted from the feed.
  final bool deleted;
  final String createdAt;
  final String? closedAt;
  final String? archivedAt;

  /// The accepted bid; for an attorney only when it is their own bid.
  final HistoryAcceptedBidDto? acceptedBid;

  Map<String, Object?> toJson() => _$CaseHistoryItemDtoToJson(this);
}
