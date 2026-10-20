// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'poll_dto.dart';
import 'response_meta_dto.dart';

part 'poll_envelope.g.dart';

@JsonSerializable()
class PollEnvelope {
  const PollEnvelope({required this.data, this.meta});

  factory PollEnvelope.fromJson(Map<String, Object?> json) =>
      _$PollEnvelopeFromJson(json);

  final PollDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PollEnvelopeToJson(this);
}
