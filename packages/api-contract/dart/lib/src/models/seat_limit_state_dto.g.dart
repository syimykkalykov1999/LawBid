// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_limit_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatLimitStateDto _$SeatLimitStateDtoFromJson(Map<String, dynamic> json) =>
    SeatLimitStateDto(
      limit: (json['limit'] as num).toInt(),
      isPersonal: json['isPersonal'] as bool,
      request: json['request'] == null
          ? null
          : SeatLimitRequestDto.fromJson(
              json['request'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$SeatLimitStateDtoToJson(SeatLimitStateDto instance) =>
    <String, dynamic>{
      'limit': instance.limit,
      'isPersonal': instance.isPersonal,
      'request': ?instance.request?.toJson(),
    };
