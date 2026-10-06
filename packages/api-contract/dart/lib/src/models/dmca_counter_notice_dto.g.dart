// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_counter_notice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaCounterNoticeDto _$DmcaCounterNoticeDtoFromJson(
  Map<String, dynamic> json,
) => DmcaCounterNoticeDto(
  name: json['name'] as String,
  address: json['address'] as String,
  email: json['email'] as String,
  consentJurisdiction: json['consentJurisdiction'] as bool,
  sworn: json['sworn'] as bool,
  signature: json['signature'] as String,
  phone: json['phone'] as String?,
);

Map<String, dynamic> _$DmcaCounterNoticeDtoToJson(
  DmcaCounterNoticeDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'address': instance.address,
  'phone': ?instance.phone,
  'email': instance.email,
  'consentJurisdiction': instance.consentJurisdiction,
  'sworn': instance.sworn,
  'signature': instance.signature,
};
