// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'firm_member_dto.dart';
import 'response_meta_dto.dart';

part 'firm_member_list_envelope.g.dart';

@JsonSerializable()
class FirmMemberListEnvelope {
  const FirmMemberListEnvelope({required this.data, this.meta});

  factory FirmMemberListEnvelope.fromJson(Map<String, Object?> json) =>
      _$FirmMemberListEnvelopeFromJson(json);

  final List<FirmMemberDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$FirmMemberListEnvelopeToJson(this);
}
