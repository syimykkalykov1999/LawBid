// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_seat_limit_request_dto.dart';
import 'response_meta_dto.dart';

part 'admin_seat_limit_request_list_envelope.g.dart';

@JsonSerializable()
class AdminSeatLimitRequestListEnvelope {
  const AdminSeatLimitRequestListEnvelope({required this.data, this.meta});

  factory AdminSeatLimitRequestListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminSeatLimitRequestListEnvelopeFromJson(json);

  final List<AdminSeatLimitRequestDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminSeatLimitRequestListEnvelopeToJson(this);
}
