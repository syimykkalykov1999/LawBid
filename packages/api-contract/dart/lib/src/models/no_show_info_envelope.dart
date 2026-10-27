// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'no_show_info_dto.dart';
import 'response_meta_dto.dart';

part 'no_show_info_envelope.g.dart';

@JsonSerializable()
class NoShowInfoEnvelope {
  const NoShowInfoEnvelope({required this.data, this.meta});

  factory NoShowInfoEnvelope.fromJson(Map<String, Object?> json) =>
      _$NoShowInfoEnvelopeFromJson(json);

  final NoShowInfoDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$NoShowInfoEnvelopeToJson(this);
}
