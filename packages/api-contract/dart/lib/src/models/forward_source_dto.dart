// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'forward_source_kind.dart';

part 'forward_source_dto.g.dart';

@JsonSerializable()
class ForwardSourceDto {
  const ForwardSourceDto({required this.kind, required this.id});

  factory ForwardSourceDto.fromJson(Map<String, Object?> json) =>
      _$ForwardSourceDtoFromJson(json);

  /// message: a direct / case chat message; group_message; channel_post; group_link / channel_link: a protected group / channel shared as its link (id = the group / channel).
  final ForwardSourceKind kind;
  final String id;

  Map<String, Object?> toJson() => _$ForwardSourceDtoToJson(this);
}
