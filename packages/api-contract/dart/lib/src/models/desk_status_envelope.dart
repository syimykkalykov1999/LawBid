// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'desk_status_dto.dart';
import 'response_meta_dto.dart';

part 'desk_status_envelope.g.dart';

@JsonSerializable()
class DeskStatusEnvelope {
  const DeskStatusEnvelope({required this.data, this.meta});

  factory DeskStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$DeskStatusEnvelopeFromJson(json);

  final DeskStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DeskStatusEnvelopeToJson(this);
}
