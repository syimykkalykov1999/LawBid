// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_case_bid_dto.g.dart';

@JsonSerializable()
class AdminCaseBidDto {
  const AdminCaseBidDto({
    required this.id,
    required this.attorneyId,
    required this.attorneyName,
    required this.status,
    required this.feeType,
    required this.amountCents,
    required this.rounds,
    required this.createdAt,
  });

  factory AdminCaseBidDto.fromJson(Map<String, Object?> json) =>
      _$AdminCaseBidDtoFromJson(json);

  final String id;
  final String attorneyId;
  final String attorneyName;
  final String status;
  final String feeType;
  final int amountCents;
  final int rounds;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminCaseBidDtoToJson(this);
}
