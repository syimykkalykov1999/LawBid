// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_decide_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaDecideDto _$DmcaDecideDtoFromJson(Map<String, dynamic> json) =>
    DmcaDecideDto(
      action: DmcaDecision.fromJson(json['action'] as String),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$DmcaDecideDtoToJson(DmcaDecideDto instance) =>
    <String, dynamic>{
      'action': instance.action.toJson(),
      'note': ?instance.note,
    };
