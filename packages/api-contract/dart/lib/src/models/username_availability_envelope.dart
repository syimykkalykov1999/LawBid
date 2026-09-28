// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'username_availability_dto.dart';

part 'username_availability_envelope.g.dart';

@JsonSerializable()
class UsernameAvailabilityEnvelope {
  const UsernameAvailabilityEnvelope({required this.data, this.meta});

  factory UsernameAvailabilityEnvelope.fromJson(Map<String, Object?> json) =>
      _$UsernameAvailabilityEnvelopeFromJson(json);

  final UsernameAvailabilityDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$UsernameAvailabilityEnvelopeToJson(this);
}
