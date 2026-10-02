// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'block_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BlockUserDto _$BlockUserDtoFromJson(Map<String, dynamic> json) => BlockUserDto(
  reason: json['reason'] as String,
  banPhone: json['banPhone'] as bool? ?? false,
  banEmail: json['banEmail'] as bool? ?? false,
  banDevices: json['banDevices'] as bool? ?? false,
  days: json['days'] as num?,
);

Map<String, dynamic> _$BlockUserDtoToJson(BlockUserDto instance) =>
    <String, dynamic>{
      'reason': instance.reason,
      'days': ?instance.days,
      'banPhone': instance.banPhone,
      'banEmail': instance.banEmail,
      'banDevices': instance.banDevices,
    };
