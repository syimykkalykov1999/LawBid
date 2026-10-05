// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_info_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportInfoDto _$SupportInfoDtoFromJson(Map<String, dynamic> json) =>
    SupportInfoDto(
      open: json['open'] as bool,
      alwaysOpen: json['alwaysOpen'] as bool,
      expectedReplyMinutes: json['expectedReplyMinutes'] as num,
      opensAt: json['opensAt'] == null
          ? null
          : DateTime.parse(json['opensAt'] as String),
    );

Map<String, dynamic> _$SupportInfoDtoToJson(SupportInfoDto instance) =>
    <String, dynamic>{
      'open': instance.open,
      'alwaysOpen': instance.alwaysOpen,
      'expectedReplyMinutes': instance.expectedReplyMinutes,
      'opensAt': ?instance.opensAt?.toIso8601String(),
    };
