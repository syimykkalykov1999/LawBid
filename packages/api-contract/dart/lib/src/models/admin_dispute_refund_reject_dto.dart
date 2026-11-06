// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_dispute_refund_reject_dto.g.dart';

@JsonSerializable()
class AdminDisputeRefundRejectDto {
  const AdminDisputeRefundRejectDto({required this.note});

  factory AdminDisputeRefundRejectDto.fromJson(Map<String, Object?> json) =>
      _$AdminDisputeRefundRejectDtoFromJson(json);

  final String note;

  Map<String, Object?> toJson() => _$AdminDisputeRefundRejectDtoToJson(this);
}
