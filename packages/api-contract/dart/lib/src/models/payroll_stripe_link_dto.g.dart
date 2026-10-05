// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_stripe_link_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollStripeLinkDto _$PayrollStripeLinkDtoFromJson(
  Map<String, dynamic> json,
) => PayrollStripeLinkDto(
  url: json['url'] as String,
  payoutsEnabled: json['payoutsEnabled'] as bool,
);

Map<String, dynamic> _$PayrollStripeLinkDtoToJson(
  PayrollStripeLinkDto instance,
) => <String, dynamic>{
  'url': instance.url,
  'payoutsEnabled': instance.payoutsEnabled,
};
