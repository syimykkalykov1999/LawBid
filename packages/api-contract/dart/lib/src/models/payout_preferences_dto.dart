// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'processing_fee_payer.dart';

part 'payout_preferences_dto.g.dart';

@JsonSerializable()
class PayoutPreferencesDto {
  const PayoutPreferencesDto({required this.processingFeePayer});

  factory PayoutPreferencesDto.fromJson(Map<String, Object?> json) =>
      _$PayoutPreferencesDtoFromJson(json);

  /// Who covers Stripe's card fee on this attorney's invoices.
  final ProcessingFeePayer processingFeePayer;

  Map<String, Object?> toJson() => _$PayoutPreferencesDtoToJson(this);
}
