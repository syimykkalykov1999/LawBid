// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_request_dto.dart';
import 'response_meta_dto.dart';

part 'data_request_envelope.g.dart';

@JsonSerializable()
class DataRequestEnvelope {
  const DataRequestEnvelope({required this.data, this.meta});

  factory DataRequestEnvelope.fromJson(Map<String, Object?> json) =>
      _$DataRequestEnvelopeFromJson(json);

  final DataRequestDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DataRequestEnvelopeToJson(this);
}
