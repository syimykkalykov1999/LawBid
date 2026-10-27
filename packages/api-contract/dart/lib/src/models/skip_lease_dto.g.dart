// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'skip_lease_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SkipLeaseDto _$SkipLeaseDtoFromJson(Map<String, dynamic> json) =>
    SkipLeaseDto(reason: LeaseSkipReason.fromJson(json['reason'] as String));

Map<String, dynamic> _$SkipLeaseDtoToJson(SkipLeaseDto instance) =>
    <String, dynamic>{'reason': instance.reason.toJson()};
