// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_digest_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDigestDto _$StaffDigestDtoFromJson(Map<String, dynamic> json) =>
    StaffDigestDto(
      weekStart: json['weekStart'] as String,
      numbers: StaffDigestNumbersDto.fromJson(
        json['numbers'] as Map<String, dynamic>,
      ),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$StaffDigestDtoToJson(StaffDigestDto instance) =>
    <String, dynamic>{
      'weekStart': instance.weekStart,
      'numbers': instance.numbers.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
