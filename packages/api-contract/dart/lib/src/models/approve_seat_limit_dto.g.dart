// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'approve_seat_limit_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ApproveSeatLimitDto _$ApproveSeatLimitDtoFromJson(Map<String, dynamic> json) =>
    ApproveSeatLimitDto(
      seats: (json['seats'] as num).toInt(),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$ApproveSeatLimitDtoToJson(
  ApproveSeatLimitDto instance,
) => <String, dynamic>{'seats': instance.seats, 'note': ?instance.note};
