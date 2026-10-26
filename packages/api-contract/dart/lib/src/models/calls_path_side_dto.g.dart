// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calls_path_side_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallsPathSideDto _$CallsPathSideDtoFromJson(Map<String, dynamic> json) =>
    CallsPathSideDto(
      configured: json['configured'] as bool,
      parts: Map<String, bool>.from(json['parts'] as Map),
      lastProbeAt: json['lastProbeAt'] == null
          ? null
          : DateTime.parse(json['lastProbeAt'] as String),
      lastProbeOk: json['lastProbeOk'] as bool?,
      check: json['check'] == null
          ? null
          : CallsPathCheckDto.fromJson(json['check'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CallsPathSideDtoToJson(CallsPathSideDto instance) =>
    <String, dynamic>{
      'configured': instance.configured,
      'parts': instance.parts,
      'lastProbeAt': ?instance.lastProbeAt?.toIso8601String(),
      'lastProbeOk': ?instance.lastProbeOk,
      'check': ?instance.check?.toJson(),
    };
