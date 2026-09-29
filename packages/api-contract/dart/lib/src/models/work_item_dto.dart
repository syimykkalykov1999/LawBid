// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_status.dart';
import 'fee_type.dart';

part 'work_item_dto.g.dart';

@JsonSerializable()
class WorkItemDto {
  const WorkItemDto({
    required this.caseId,
    required this.bidId,
    required this.title,
    required this.status,
    required this.feeType,
    required this.amountCents,
    this.clientName,
    this.autoCloseAt,
    this.acceptedAt,
    this.closedAt,
  });

  factory WorkItemDto.fromJson(Map<String, Object?> json) =>
      _$WorkItemDtoFromJson(json);

  final String caseId;
  final String bidId;
  final String title;
  final CaseStatus status;

  /// Client name; null while the subscription is inactive (contacts are locked, §8.3).
  final String? clientName;
  final FeeType feeType;
  final int amountCents;
  final String? autoCloseAt;
  final String? acceptedAt;
  final String? closedAt;

  Map<String, Object?> toJson() => _$WorkItemDtoToJson(this);
}
