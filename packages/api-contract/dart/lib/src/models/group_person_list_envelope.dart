// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_person_dto.dart';
import 'response_meta_dto.dart';

part 'group_person_list_envelope.g.dart';

@JsonSerializable()
class GroupPersonListEnvelope {
  const GroupPersonListEnvelope({required this.data, this.meta});

  factory GroupPersonListEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupPersonListEnvelopeFromJson(json);

  final List<GroupPersonDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupPersonListEnvelopeToJson(this);
}
