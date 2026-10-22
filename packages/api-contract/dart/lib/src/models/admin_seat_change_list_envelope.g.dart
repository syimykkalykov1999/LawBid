// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_seat_change_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSeatChangeListEnvelope _$AdminSeatChangeListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSeatChangeListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminSeatChangeDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSeatChangeListEnvelopeToJson(
  AdminSeatChangeListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
