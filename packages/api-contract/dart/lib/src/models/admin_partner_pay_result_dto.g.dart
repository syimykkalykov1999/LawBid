// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_pay_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerPayResultDto _$AdminPartnerPayResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminPartnerPayResultDto(
  count: (json['count'] as num).toInt(),
  totalCents: (json['totalCents'] as num).toInt(),
);

Map<String, dynamic> _$AdminPartnerPayResultDtoToJson(
  AdminPartnerPayResultDto instance,
) => <String, dynamic>{
  'count': instance.count,
  'totalCents': instance.totalCents,
};
