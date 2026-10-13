// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'phone_status_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PhoneStatusResultDto _$PhoneStatusResultDtoFromJson(
  Map<String, dynamic> json,
) => PhoneStatusResultDto(
  registered: json['registered'] as bool,
  hasPassword: json['hasPassword'] as bool,
);

Map<String, dynamic> _$PhoneStatusResultDtoToJson(
  PhoneStatusResultDto instance,
) => <String, dynamic>{
  'registered': instance.registered,
  'hasPassword': instance.hasPassword,
};
