// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_country_partner_share_dto.g.dart';

@JsonSerializable()
class SetCountryPartnerShareDto {
  const SetCountryPartnerShareDto({required this.sharePercent});

  factory SetCountryPartnerShareDto.fromJson(Map<String, Object?> json) =>
      _$SetCountryPartnerShareDtoFromJson(json);

  /// Percent (0.01–90).
  final num sharePercent;

  Map<String, Object?> toJson() => _$SetCountryPartnerShareDtoToJson(this);
}
