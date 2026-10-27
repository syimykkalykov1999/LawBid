// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_appeal_receipt_dto_status.dart';

part 'staff_appeal_receipt_dto.g.dart';

@JsonSerializable()
class StaffAppealReceiptDto {
  const StaffAppealReceiptDto({
    required this.id,
    required this.number,
    required this.status,
    required this.createdAt,
  });

  factory StaffAppealReceiptDto.fromJson(Map<String, Object?> json) =>
      _$StaffAppealReceiptDtoFromJson(json);

  final String id;

  /// Appeal number («автор №N» for anonymous).
  final num number;
  final StaffAppealReceiptDtoStatus status;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$StaffAppealReceiptDtoToJson(this);
}
