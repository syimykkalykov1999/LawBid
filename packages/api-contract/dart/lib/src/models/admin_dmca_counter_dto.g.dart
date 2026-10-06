// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dmca_counter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDmcaCounterDto _$AdminDmcaCounterDtoFromJson(Map<String, dynamic> json) =>
    AdminDmcaCounterDto(
      name: json['name'] as String,
      address: json['address'] as String,
      email: json['email'] as String,
      consentJurisdiction: json['consentJurisdiction'] as bool,
      sworn: json['sworn'] as bool,
      signature: json['signature'] as String,
      submittedAt: DateTime.parse(json['submittedAt'] as String),
      phone: json['phone'] as String?,
    );

Map<String, dynamic> _$AdminDmcaCounterDtoToJson(
  AdminDmcaCounterDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'address': instance.address,
  'phone': ?instance.phone,
  'email': instance.email,
  'consentJurisdiction': instance.consentJurisdiction,
  'sworn': instance.sworn,
  'signature': instance.signature,
  'submittedAt': instance.submittedAt.toIso8601String(),
};
