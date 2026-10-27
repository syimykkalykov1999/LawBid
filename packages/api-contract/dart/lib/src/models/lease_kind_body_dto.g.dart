// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lease_kind_body_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LeaseKindBodyDto _$LeaseKindBodyDtoFromJson(Map<String, dynamic> json) =>
    LeaseKindBodyDto(kind: LeaseQueueKind.fromJson(json['kind'] as String));

Map<String, dynamic> _$LeaseKindBodyDtoToJson(LeaseKindBodyDto instance) =>
    <String, dynamic>{'kind': instance.kind.toJson()};
