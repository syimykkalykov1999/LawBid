// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_mine_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaMineDto _$DmcaMineDtoFromJson(Map<String, dynamic> json) => DmcaMineDto(
  submitted: (json['submitted'] as List<dynamic>)
      .map((e) => DmcaNoticeBriefDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  against: (json['against'] as List<dynamic>)
      .map((e) => DmcaNoticeBriefDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$DmcaMineDtoToJson(DmcaMineDto instance) =>
    <String, dynamic>{
      'submitted': instance.submitted.map((e) => e.toJson()).toList(),
      'against': instance.against.map((e) => e.toJson()).toList(),
    };
