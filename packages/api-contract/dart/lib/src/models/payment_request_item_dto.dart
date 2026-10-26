// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'payment_request_item_dto.g.dart';

@JsonSerializable()
class PaymentRequestItemDto {
  const PaymentRequestItemDto({
    required this.amountCents,
    this.description,
    this.dueAt,
  });

  factory PaymentRequestItemDto.fromJson(Map<String, Object?> json) =>
      _$PaymentRequestItemDtoFromJson(json);

  final int amountCents;

  /// What this is for; defaults to the plan description.
  final String? description;
  final DateTime? dueAt;

  Map<String, Object?> toJson() => _$PaymentRequestItemDtoToJson(this);
}
