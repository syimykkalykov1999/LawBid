// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'password_saved_dto.dart';
import 'response_meta_dto.dart';

part 'password_saved_envelope.g.dart';

@JsonSerializable()
class PasswordSavedEnvelope {
  const PasswordSavedEnvelope({required this.data, this.meta});

  factory PasswordSavedEnvelope.fromJson(Map<String, Object?> json) =>
      _$PasswordSavedEnvelopeFromJson(json);

  final PasswordSavedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PasswordSavedEnvelopeToJson(this);
}
