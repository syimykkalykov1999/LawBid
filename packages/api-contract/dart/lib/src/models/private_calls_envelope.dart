// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'private_calls_dto.dart';
import 'response_meta_dto.dart';

part 'private_calls_envelope.g.dart';

@JsonSerializable()
class PrivateCallsEnvelope {
  const PrivateCallsEnvelope({required this.data, this.meta});

  factory PrivateCallsEnvelope.fromJson(Map<String, Object?> json) =>
      _$PrivateCallsEnvelopeFromJson(json);

  final PrivateCallsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PrivateCallsEnvelopeToJson(this);
}
