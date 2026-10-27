// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_retaliation_flag_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffRetaliationFlagDto _$StaffRetaliationFlagDtoFromJson(
  Map<String, dynamic> json,
) => StaffRetaliationFlagDto(
  id: json['id'] as String,
  appealId: json['appealId'] as String,
  appealNumber: json['appealNumber'] as num,
  subject: StaffAppealAuthorDto.fromJson(
    json['subject'] as Map<String, dynamic>,
  ),
  state: StaffRetaliationFlagDtoState.fromJson(json['state'] as String),
  windowUntil: DateTime.parse(json['windowUntil'] as String),
  holdUntil: json['holdUntil'] == null
      ? null
      : DateTime.parse(json['holdUntil'] as String),
  holdActive: json['holdActive'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
  decidedAt: json['decidedAt'] == null
      ? null
      : DateTime.parse(json['decidedAt'] as String),
);

Map<String, dynamic> _$StaffRetaliationFlagDtoToJson(
  StaffRetaliationFlagDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'appealId': instance.appealId,
  'appealNumber': instance.appealNumber,
  'subject': instance.subject.toJson(),
  'state': instance.state.toJson(),
  'windowUntil': instance.windowUntil.toIso8601String(),
  'holdUntil': ?instance.holdUntil?.toIso8601String(),
  'holdActive': instance.holdActive,
  'createdAt': instance.createdAt.toIso8601String(),
  'decidedAt': ?instance.decidedAt?.toIso8601String(),
};
