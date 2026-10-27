// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'user_notice_dto.dart';

part 'user_notice_envelope.g.dart';

@JsonSerializable()
class UserNoticeEnvelope {
  const UserNoticeEnvelope({required this.data, this.meta});

  factory UserNoticeEnvelope.fromJson(Map<String, Object?> json) =>
      _$UserNoticeEnvelopeFromJson(json);

  final UserNoticeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$UserNoticeEnvelopeToJson(this);
}
