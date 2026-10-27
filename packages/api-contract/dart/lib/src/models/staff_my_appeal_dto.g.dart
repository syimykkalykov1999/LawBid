// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_my_appeal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffMyAppealDto _$StaffMyAppealDtoFromJson(Map<String, dynamic> json) =>
    StaffMyAppealDto(
      id: json['id'] as String,
      number: json['number'] as num,
      status: StaffMyAppealDtoStatus.fromJson(json['status'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      kind: StaffMyAppealDtoKind.fromJson(json['kind'] as String),
      anonymous: json['anonymous'] as bool,
      ackAt: json['ackAt'] == null
          ? null
          : DateTime.parse(json['ackAt'] as String),
    );

Map<String, dynamic> _$StaffMyAppealDtoToJson(StaffMyAppealDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'number': instance.number,
      'status': instance.status.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
      'kind': instance.kind.toJson(),
      'anonymous': instance.anonymous,
      'ackAt': ?instance.ackAt?.toIso8601String(),
    };
