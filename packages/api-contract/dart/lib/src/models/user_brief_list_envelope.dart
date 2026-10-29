// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'user_brief_dto.dart';

part 'user_brief_list_envelope.g.dart';

@JsonSerializable()
class UserBriefListEnvelope {
  const UserBriefListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory UserBriefListEnvelope.fromJson(Map<String, Object?> json) => _$UserBriefListEnvelopeFromJson(json);
  
  final List<UserBriefDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$UserBriefListEnvelopeToJson(this);
}
