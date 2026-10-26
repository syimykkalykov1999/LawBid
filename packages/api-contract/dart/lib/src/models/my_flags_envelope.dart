// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_flags_dto.dart';
import 'response_meta_dto.dart';

part 'my_flags_envelope.g.dart';

@JsonSerializable()
class MyFlagsEnvelope {
  const MyFlagsEnvelope({required this.data, this.meta});

  factory MyFlagsEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyFlagsEnvelopeFromJson(json);

  final MyFlagsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyFlagsEnvelopeToJson(this);
}
