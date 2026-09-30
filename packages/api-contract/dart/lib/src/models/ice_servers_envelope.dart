// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ice_servers_dto.dart';
import 'response_meta_dto.dart';

part 'ice_servers_envelope.g.dart';

@JsonSerializable()
class IceServersEnvelope {
  const IceServersEnvelope({required this.data, this.meta});

  factory IceServersEnvelope.fromJson(Map<String, Object?> json) =>
      _$IceServersEnvelopeFromJson(json);

  final IceServersDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$IceServersEnvelopeToJson(this);
}
