// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'auto_action_dto.dart';
import 'response_meta_dto.dart';

part 'auto_action_envelope.g.dart';

@JsonSerializable()
class AutoActionEnvelope {
  const AutoActionEnvelope({required this.data, this.meta});

  factory AutoActionEnvelope.fromJson(Map<String, Object?> json) =>
      _$AutoActionEnvelopeFromJson(json);

  final AutoActionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AutoActionEnvelopeToJson(this);
}
