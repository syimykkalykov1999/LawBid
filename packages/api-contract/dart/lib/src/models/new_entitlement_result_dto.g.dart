// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'new_entitlement_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NewEntitlementResultDto _$NewEntitlementResultDtoFromJson(
  Map<String, dynamic> json,
) => NewEntitlementResultDto(
  entitlement: EntitlementDefDto.fromJson(
    json['entitlement'] as Map<String, dynamic>,
  ),
  privateNote: LocalizedTextDto.fromJson(json['_note'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NewEntitlementResultDtoToJson(
  NewEntitlementResultDto instance,
) => <String, dynamic>{
  'entitlement': instance.entitlement.toJson(),
  '_note': instance.privateNote.toJson(),
};
