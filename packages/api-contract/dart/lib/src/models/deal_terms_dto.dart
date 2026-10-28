// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_type.dart';
import 'payment_terms_dto.dart';

part 'deal_terms_dto.g.dart';

@JsonSerializable()
class DealTermsDto {
  const DealTermsDto({
    required this.feeType,
    required this.amountCents,
    required this.percentBps,
    this.paymentTerms,
  });

  factory DealTermsDto.fromJson(Map<String, Object?> json) =>
      _$DealTermsDtoFromJson(json);

  final FeeType feeType;
  final int amountCents;
  final int? percentBps;
  final PaymentTermsDto? paymentTerms;

  Map<String, Object?> toJson() => _$DealTermsDtoToJson(this);
}
