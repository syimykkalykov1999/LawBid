// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_signal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSignalDto _$StaffSignalDtoFromJson(Map<String, dynamic> json) =>
    StaffSignalDto(
      id: json['id'] as String,
      code: json['code'] as String,
      subject: StaffPersonRefDto.fromJson(
        json['subject'] as Map<String, dynamic>,
      ),
      actor: json['actor'] == null
          ? null
          : StaffPersonRefDto.fromJson(json['actor'] as Map<String, dynamic>),
      details: json['details'],
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$StaffSignalDtoToJson(StaffSignalDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'code': instance.code,
      'subject': instance.subject.toJson(),
      'actor': ?instance.actor?.toJson(),
      'details': ?instance.details,
      'createdAt': instance.createdAt.toIso8601String(),
    };
