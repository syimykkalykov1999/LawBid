// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'username_check_dto.dart';

part 'username_check_envelope.g.dart';

@JsonSerializable()
class UsernameCheckEnvelope {
  const UsernameCheckEnvelope({
    required this.data,
    this.meta,
  });
  
  factory UsernameCheckEnvelope.fromJson(Map<String, Object?> json) => _$UsernameCheckEnvelopeFromJson(json);
  
  final UsernameCheckDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$UsernameCheckEnvelopeToJson(this);
}
