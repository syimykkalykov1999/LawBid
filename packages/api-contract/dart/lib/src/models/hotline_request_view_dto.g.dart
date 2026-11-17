// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_request_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineRequestViewDto _$HotlineRequestViewDtoFromJson(
  Map<String, dynamic> json,
) => HotlineRequestViewDto(
  id: json['id'] as String,
  status: HotlineRequestStatus.fromJson(json['status'] as String),
  positionBand: json['positionBand'] as String?,
  waitBand: json['waitBand'] as String?,
  endReason: json['endReason'] as String?,
  lawyer: json['lawyer'] == null
      ? null
      : HotlineLawyerDto.fromJson(json['lawyer'] as Map<String, dynamic>),
  notifyUntil: json['notifyUntil'] as num?,
  disclosure: json['disclosure'] == null
      ? null
      : HotlineDisclosureDto.fromJson(
          json['disclosure'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$HotlineRequestViewDtoToJson(
  HotlineRequestViewDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'positionBand': ?instance.positionBand,
  'waitBand': ?instance.waitBand,
  'endReason': ?instance.endReason,
  'lawyer': ?instance.lawyer?.toJson(),
  'notifyUntil': ?instance.notifyUntil,
  'disclosure': ?instance.disclosure?.toJson(),
};
