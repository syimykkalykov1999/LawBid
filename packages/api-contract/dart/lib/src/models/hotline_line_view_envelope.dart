// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_line_view_dto.dart';
import 'response_meta_dto.dart';

part 'hotline_line_view_envelope.g.dart';

@JsonSerializable()
class HotlineLineViewEnvelope {
  const HotlineLineViewEnvelope({required this.data, this.meta});

  factory HotlineLineViewEnvelope.fromJson(Map<String, Object?> json) =>
      _$HotlineLineViewEnvelopeFromJson(json);

  final HotlineLineViewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HotlineLineViewEnvelopeToJson(this);
}
