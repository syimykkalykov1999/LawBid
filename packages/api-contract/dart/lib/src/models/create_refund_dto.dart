// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_refund_dto.g.dart';

@JsonSerializable()
class CreateRefundDto {
  const CreateRefundDto({
    required this.reason,
    required this.paymentId,
    required this.amountCents,
  });

  factory CreateRefundDto.fromJson(Map<String, Object?> json) =>
      _$CreateRefundDtoFromJson(json);

  final String reason;
  final String paymentId;

  /// At most the paid amount minus earlier refunds.
  final int amountCents;

  Map<String, Object?> toJson() => _$CreateRefundDtoToJson(this);
}
