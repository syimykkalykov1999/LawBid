// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'status_page_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StatusPageDto _$StatusPageDtoFromJson(Map<String, dynamic> json) =>
    StatusPageDto(
      publishing: json['publishing'] as bool,
      incidents: (json['incidents'] as List<dynamic>)
          .map((e) => StatusIncidentDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StatusPageDtoToJson(StatusPageDto instance) =>
    <String, dynamic>{
      'publishing': instance.publishing,
      'incidents': instance.incidents.map((e) => e.toJson()).toList(),
    };
