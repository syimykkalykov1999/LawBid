// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_payment_party_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePaymentPartyDto _$CasePaymentPartyDtoFromJson(Map<String, dynamic> json) =>
    CasePaymentPartyDto(
      id: json['id'] as String,
      name: json['name'] as String?,
      username: json['username'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$CasePaymentPartyDtoToJson(
  CasePaymentPartyDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': ?instance.name,
  'username': ?instance.username,
  'avatarUrl': ?instance.avatarUrl,
};
