// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodayEnvelope _$StaffTodayEnvelopeFromJson(Map<String, dynamic> json) =>
    StaffTodayEnvelope(
      data: StaffTodayDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StaffTodayEnvelopeToJson(StaffTodayEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
