// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_limit_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatLimitRequestDto _$SeatLimitRequestDtoFromJson(Map<String, dynamic> json) =>
    SeatLimitRequestDto(
      id: json['id'] as String,
      status: SeatLimitRequestStatus.fromJson(json['status'] as String),
      requestedSeats: (json['requestedSeats'] as num).toInt(),
      grantedSeats: (json['grantedSeats'] as num?)?.toInt(),
      note: json['note'] as String?,
      decisionNote: json['decisionNote'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
    );

Map<String, dynamic> _$SeatLimitRequestDtoToJson(
  SeatLimitRequestDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'requestedSeats': instance.requestedSeats,
  'grantedSeats': ?instance.grantedSeats,
  'note': ?instance.note,
  'decisionNote': ?instance.decisionNote,
  'createdAt': instance.createdAt.toIso8601String(),
  'decidedAt': ?instance.decidedAt?.toIso8601String(),
};
