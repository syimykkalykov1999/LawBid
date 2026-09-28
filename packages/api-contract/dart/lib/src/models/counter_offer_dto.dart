// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'counter_offer_dto.g.dart';

@JsonSerializable()
class CounterOfferDto {
  const CounterOfferDto({required this.amountCents, this.message});

  factory CounterOfferDto.fromJson(Map<String, Object?> json) =>
      _$CounterOfferDtoFromJson(json);

  final int amountCents;
  final String? message;

  Map<String, Object?> toJson() => _$CounterOfferDtoToJson(this);
}
