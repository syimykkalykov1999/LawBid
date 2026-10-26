// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'board_case_task_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BoardCaseTaskListEnvelope _$BoardCaseTaskListEnvelopeFromJson(
  Map<String, dynamic> json,
) => BoardCaseTaskListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => BoardCaseTaskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BoardCaseTaskListEnvelopeToJson(
  BoardCaseTaskListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
