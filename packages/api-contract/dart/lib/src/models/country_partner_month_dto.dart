// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'country_partner_month_dto.g.dart';

@JsonSerializable()
class CountryPartnerMonthDto {
  const CountryPartnerMonthDto({
    required this.currency,
    required this.grossCents,
    required this.refundsCents,
    required this.feesCents,
    required this.netCents,
    required this.amountCents,
  });

  factory CountryPartnerMonthDto.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerMonthDtoFromJson(json);

  final String currency;
  final int grossCents;
  final int refundsCents;
  final int feesCents;
  final int netCents;
  final int amountCents;

  Map<String, Object?> toJson() => _$CountryPartnerMonthDtoToJson(this);
}
