// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_status.dart';

part 'set_country_partner_status_dto.g.dart';

@JsonSerializable()
class SetCountryPartnerStatusDto {
  const SetCountryPartnerStatusDto({required this.status});

  factory SetCountryPartnerStatusDto.fromJson(Map<String, Object?> json) =>
      _$SetCountryPartnerStatusDtoFromJson(json);

  /// paused = payouts wait, the team keeps working; disabled = the whole team is signed out and blocked, payouts stop.
  final CountryPartnerStatus status;

  Map<String, Object?> toJson() => _$SetCountryPartnerStatusDtoToJson(this);
}
