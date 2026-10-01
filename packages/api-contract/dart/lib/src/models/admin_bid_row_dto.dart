// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_bid_row_dto.g.dart';

@JsonSerializable()
class AdminBidRowDto {
  const AdminBidRowDto({
    required this.id,
    required this.caseId,
    required this.caseTitle,
    required this.attorneyName,
    required this.status,
    required this.feeType,
    required this.amountCents,
    required this.rounds,
    required this.outsidePractice,
    required this.createdAt,
  });

  factory AdminBidRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminBidRowDtoFromJson(json);

  final String id;
  final String caseId;
  final String caseTitle;
  final String attorneyName;
  final String status;
  final String feeType;
  final int amountCents;
  final int rounds;
  final bool outsidePractice;
  final String createdAt;

  Map<String, Object?> toJson() => _$AdminBidRowDtoToJson(this);
}
