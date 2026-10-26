// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'status_page_dto.dart';

part 'status_page_envelope.g.dart';

@JsonSerializable()
class StatusPageEnvelope {
  const StatusPageEnvelope({required this.data, this.meta});

  factory StatusPageEnvelope.fromJson(Map<String, Object?> json) =>
      _$StatusPageEnvelopeFromJson(json);

  final StatusPageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StatusPageEnvelopeToJson(this);
}
