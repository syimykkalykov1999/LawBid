// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'forward_source_dto.dart';
import 'forward_target_dto.dart';

part 'forward_messages_dto.g.dart';

@JsonSerializable()
class ForwardMessagesDto {
  const ForwardMessagesDto({
    required this.requestId,
    required this.sources,
    required this.targets,
  });

  factory ForwardMessagesDto.fromJson(Map<String, Object?> json) =>
      _$ForwardMessagesDtoFromJson(json);

  /// App-generated, one per forward: a retry with the same id sends nothing twice.
  final String requestId;

  /// What to forward, oldest first (1–50); the order is kept.
  final List<ForwardSourceDto> sources;

  /// Where to (1–20); at most 200 message × chat pairs.
  final List<ForwardTargetDto> targets;

  Map<String, Object?> toJson() => _$ForwardMessagesDtoToJson(this);
}
