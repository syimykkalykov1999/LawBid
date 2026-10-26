// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_country_partner_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetCountryPartnerStatusDto _$SetCountryPartnerStatusDtoFromJson(
  Map<String, dynamic> json,
) => SetCountryPartnerStatusDto(
  status: CountryPartnerStatus.fromJson(json['status'] as String),
);

Map<String, dynamic> _$SetCountryPartnerStatusDtoToJson(
  SetCountryPartnerStatusDto instance,
) => <String, dynamic>{'status': instance.status.toJson()};
