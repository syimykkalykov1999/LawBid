// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_seat_limit_request_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSeatLimitRequestListEnvelope _$AdminSeatLimitRequestListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSeatLimitRequestListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminSeatLimitRequestDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSeatLimitRequestListEnvelopeToJson(
  AdminSeatLimitRequestListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
