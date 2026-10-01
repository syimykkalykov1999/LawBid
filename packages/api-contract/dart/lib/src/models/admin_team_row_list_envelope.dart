// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_team_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_team_row_list_envelope.g.dart';

@JsonSerializable()
class AdminTeamRowListEnvelope {
  const AdminTeamRowListEnvelope({required this.data, this.meta});

  factory AdminTeamRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminTeamRowListEnvelopeFromJson(json);

  final List<AdminTeamRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminTeamRowListEnvelopeToJson(this);
}
