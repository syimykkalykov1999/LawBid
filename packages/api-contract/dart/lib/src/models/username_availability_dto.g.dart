// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'username_availability_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsernameAvailabilityDto _$UsernameAvailabilityDtoFromJson(
  Map<String, dynamic> json,
) => UsernameAvailabilityDto(
  username: json['username'] as String,
  available: json['available'] as bool,
  reason: json['reason'] == null
      ? null
      : UsernameUnavailableReason.fromJson(json['reason'] as String),
);

Map<String, dynamic> _$UsernameAvailabilityDtoToJson(
  UsernameAvailabilityDto instance,
) => <String, dynamic>{
  'username': instance.username,
  'available': instance.available,
  'reason': ?instance.reason?.toJson(),
};
