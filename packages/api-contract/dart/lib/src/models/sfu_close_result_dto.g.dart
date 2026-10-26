// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_close_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuCloseResultDto _$SfuCloseResultDtoFromJson(Map<String, dynamic> json) =>
    SfuCloseResultDto(
      closed: (json['closed'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      type: json['type'] == null
          ? null
          : SfuCloseResultDtoType.fromJson(json['type'] as String),
      sdp: json['sdp'] as String?,
    );

Map<String, dynamic> _$SfuCloseResultDtoToJson(SfuCloseResultDto instance) =>
    <String, dynamic>{
      'closed': instance.closed,
      'type': ?instance.type?.toJson(),
      'sdp': ?instance.sdp,
    };
