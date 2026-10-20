// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conflict_check_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConflictCheckDto _$ConflictCheckDtoFromJson(Map<String, dynamic> json) =>
    ConflictCheckDto(
      conflict: json['conflict'] as bool,
      matches: (json['matches'] as List<dynamic>)
          .map((e) => ConflictMatchDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ConflictCheckDtoToJson(ConflictCheckDto instance) =>
    <String, dynamic>{
      'conflict': instance.conflict,
      'matches': instance.matches.map((e) => e.toJson()).toList(),
    };
