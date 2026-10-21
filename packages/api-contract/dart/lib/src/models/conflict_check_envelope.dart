// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conflict_check_dto.dart';
import 'response_meta_dto.dart';

part 'conflict_check_envelope.g.dart';

@JsonSerializable()
class ConflictCheckEnvelope {
  const ConflictCheckEnvelope({required this.data, this.meta});

  factory ConflictCheckEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConflictCheckEnvelopeFromJson(json);

  final ConflictCheckDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConflictCheckEnvelopeToJson(this);
}
