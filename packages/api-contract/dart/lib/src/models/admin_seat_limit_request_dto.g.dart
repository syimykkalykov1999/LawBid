// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_seat_limit_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSeatLimitRequestDto _$AdminSeatLimitRequestDtoFromJson(
  Map<String, dynamic> json,
) => AdminSeatLimitRequestDto(
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
  attorneyId: json['attorneyId'] as String,
  user: json['user'] == null
      ? null
      : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
  currentLimit: (json['currentLimit'] as num).toInt(),
  assistantsUsed: (json['assistantsUsed'] as num).toInt(),
);

Map<String, dynamic> _$AdminSeatLimitRequestDtoToJson(
  AdminSeatLimitRequestDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'requestedSeats': instance.requestedSeats,
  'grantedSeats': ?instance.grantedSeats,
  'note': ?instance.note,
  'decisionNote': ?instance.decisionNote,
  'createdAt': instance.createdAt.toIso8601String(),
  'decidedAt': ?instance.decidedAt?.toIso8601String(),
  'attorneyId': instance.attorneyId,
  'user': ?instance.user?.toJson(),
  'currentLimit': instance.currentLimit,
  'assistantsUsed': instance.assistantsUsed,
};
