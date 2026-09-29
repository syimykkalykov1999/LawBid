// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_user_bid_dto.g.dart';

@JsonSerializable()
class AdminUserBidDto {
  const AdminUserBidDto({
    required this.id,
    required this.caseId,
    required this.caseTitle,
    required this.status,
    required this.feeType,
    required this.amountCents,
    required this.createdAt,
  });

  factory AdminUserBidDto.fromJson(Map<String, Object?> json) =>
      _$AdminUserBidDtoFromJson(json);

  final String id;
  final String caseId;
  final String caseTitle;
  final String status;
  final String feeType;
  final int amountCents;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminUserBidDtoToJson(this);
}
