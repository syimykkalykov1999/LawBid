// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_request_item_dto.dart';

part 'create_payment_requests_dto.g.dart';

@JsonSerializable()
class CreatePaymentRequestsDto {
  const CreatePaymentRequestsDto({
    required this.description,
    required this.items,
  });

  factory CreatePaymentRequestsDto.fromJson(Map<String, Object?> json) =>
      _$CreatePaymentRequestsDtoFromJson(json);

  /// What the client pays for (shown on every installment).
  final String description;

  /// One item = one request; several = an installment plan.
  final List<PaymentRequestItemDto> items;

  Map<String, Object?> toJson() => _$CreatePaymentRequestsDtoToJson(this);
}
