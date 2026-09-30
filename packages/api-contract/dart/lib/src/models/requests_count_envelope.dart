// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'requests_count_dto.dart';
import 'response_meta_dto.dart';

part 'requests_count_envelope.g.dart';

@JsonSerializable()
class RequestsCountEnvelope {
  const RequestsCountEnvelope({required this.data, this.meta});

  factory RequestsCountEnvelope.fromJson(Map<String, Object?> json) =>
      _$RequestsCountEnvelopeFromJson(json);

  final RequestsCountDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RequestsCountEnvelopeToJson(this);
}
