// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_seat_limit_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateSeatLimitRequestDto _$CreateSeatLimitRequestDtoFromJson(
  Map<String, dynamic> json,
) => CreateSeatLimitRequestDto(
  seats: (json['seats'] as num).toInt(),
  note: json['note'] as String?,
);

Map<String, dynamic> _$CreateSeatLimitRequestDtoToJson(
  CreateSeatLimitRequestDto instance,
) => <String, dynamic>{'seats': instance.seats, 'note': ?instance.note};
