// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'username_suggestions_dto.dart';

part 'username_suggestions_envelope.g.dart';

@JsonSerializable()
class UsernameSuggestionsEnvelope {
  const UsernameSuggestionsEnvelope({
    required this.data,
    this.meta,
  });
  
  factory UsernameSuggestionsEnvelope.fromJson(Map<String, Object?> json) => _$UsernameSuggestionsEnvelopeFromJson(json);
  
  final UsernameSuggestionsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$UsernameSuggestionsEnvelopeToJson(this);
}
