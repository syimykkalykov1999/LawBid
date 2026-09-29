// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_history_event_dto.dart';
import 'case_status.dart';
import 'history_accepted_bid_dto.dart';
import 'history_practice_area_dto.dart';

part 'case_history_detail_dto.g.dart';

@JsonSerializable()
class CaseHistoryDetailDto {
  const CaseHistoryDetailDto({
    required this.id,
    required this.title,
    required this.practiceArea,
    required this.primaryStateCode,
    required this.status,
    required this.deleted,
    required this.createdAt,
    required this.events,
    this.closedAt,
    this.archivedAt,
    this.acceptedBid,
    this.clientName,
  });

  factory CaseHistoryDetailDto.fromJson(Map<String, Object?> json) =>
      _$CaseHistoryDetailDtoFromJson(json);

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

  /// Client full name. For an attorney only if contacts were disclosed to them on this case; null → the app shows "Client".
  final String? clientName;
  final List<CaseHistoryEventDto> events;

  Map<String, Object?> toJson() => _$CaseHistoryDetailDtoToJson(this);
}
