// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_standing_dto.dart';
import 'response_meta_dto.dart';

part 'my_standing_envelope.g.dart';

@JsonSerializable()
class MyStandingEnvelope {
  const MyStandingEnvelope({required this.data, this.meta});

  factory MyStandingEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyStandingEnvelopeFromJson(json);

  final MyStandingDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyStandingEnvelopeToJson(this);
}
