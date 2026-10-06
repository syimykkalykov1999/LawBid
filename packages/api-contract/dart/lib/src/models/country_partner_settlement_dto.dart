// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'country_partner_settlement_dto.g.dart';

@JsonSerializable()
class CountryPartnerSettlementDto {
  const CountryPartnerSettlementDto({
    required this.id,
    required this.period,
    required this.currency,
    required this.grossCents,
    required this.refundsCents,
    required this.feesCents,
    required this.netCents,
    required this.sharePercent,
    required this.amountCents,
    required this.status,
  });

  factory CountryPartnerSettlementDto.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerSettlementDtoFromJson(json);

  final String id;
  final String period;
  final String currency;
  final int grossCents;
  final int refundsCents;
  final int feesCents;
  final int netCents;
  final num sharePercent;
  final int amountCents;

  /// held · zero · pending (in payroll) · paid · canceled
  final String status;

  Map<String, Object?> toJson() => _$CountryPartnerSettlementDtoToJson(this);
}
