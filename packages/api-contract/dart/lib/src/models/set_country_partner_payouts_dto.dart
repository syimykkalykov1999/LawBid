// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_country_partner_payouts_dto.g.dart';

@JsonSerializable()
class SetCountryPartnerPayoutsDto {
  const SetCountryPartnerPayoutsDto({required this.enabled});

  factory SetCountryPartnerPayoutsDto.fromJson(Map<String, Object?> json) =>
      _$SetCountryPartnerPayoutsDtoFromJson(json);

  final bool enabled;

  Map<String, Object?> toJson() => _$SetCountryPartnerPayoutsDtoToJson(this);
}
