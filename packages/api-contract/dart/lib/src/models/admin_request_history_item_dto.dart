// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'verification_request_status.dart';

part 'admin_request_history_item_dto.g.dart';

@JsonSerializable()
class AdminRequestHistoryItemDto {
  const AdminRequestHistoryItemDto({
    required this.id,
    required this.status,
    required this.submittedAt,
    required this.reviewedAt,
    required this.rejectionCode,
    required this.createdAt,
  });

  factory AdminRequestHistoryItemDto.fromJson(Map<String, Object?> json) =>
      _$AdminRequestHistoryItemDtoFromJson(json);

  final String id;
  final VerificationRequestStatus status;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final String? rejectionCode;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminRequestHistoryItemDtoToJson(this);
}
