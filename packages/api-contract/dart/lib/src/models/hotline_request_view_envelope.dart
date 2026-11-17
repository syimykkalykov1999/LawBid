// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_request_view_dto.dart';
import 'response_meta_dto.dart';

part 'hotline_request_view_envelope.g.dart';

@JsonSerializable()
class HotlineRequestViewEnvelope {
  const HotlineRequestViewEnvelope({required this.data, this.meta});

  factory HotlineRequestViewEnvelope.fromJson(Map<String, Object?> json) =>
      _$HotlineRequestViewEnvelopeFromJson(json);

  final HotlineRequestViewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HotlineRequestViewEnvelopeToJson(this);
}
