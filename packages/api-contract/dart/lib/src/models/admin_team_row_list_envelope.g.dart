// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_team_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTeamRowListEnvelope _$AdminTeamRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminTeamRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminTeamRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminTeamRowListEnvelopeToJson(
  AdminTeamRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
