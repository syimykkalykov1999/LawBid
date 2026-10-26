// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'forward_target_kind.dart';

part 'forward_target_dto.g.dart';

@JsonSerializable()
class ForwardTargetDto {
  const ForwardTargetDto({required this.kind, required this.id, this.topicId});

  factory ForwardTargetDto.fromJson(Map<String, Object?> json) =>
      _$ForwardTargetDtoFromJson(json);

  final ForwardTargetKind kind;
  final String id;

  /// Forum groups: the topic to write in (default «General»).
  final String? topicId;

  Map<String, Object?> toJson() => _$ForwardTargetDtoToJson(this);
}
