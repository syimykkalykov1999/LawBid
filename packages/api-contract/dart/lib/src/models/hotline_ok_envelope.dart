// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_ok_dto.dart';
import 'response_meta_dto.dart';

part 'hotline_ok_envelope.g.dart';

@JsonSerializable()
class HotlineOkEnvelope {
  const HotlineOkEnvelope({required this.data, this.meta});

  factory HotlineOkEnvelope.fromJson(Map<String, Object?> json) =>
      _$HotlineOkEnvelopeFromJson(json);

  final HotlineOkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HotlineOkEnvelopeToJson(this);
}
