// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_worker_registry_link_dto.g.dart';

@JsonSerializable()
class AiWorkerRegistryLinkDto {
  const AiWorkerRegistryLinkDto({required this.stateCode, required this.url});

  factory AiWorkerRegistryLinkDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerRegistryLinkDtoFromJson(json);

  final String stateCode;

  /// The state bar’s official lookup page.
  final String url;

  Map<String, Object?> toJson() => _$AiWorkerRegistryLinkDtoToJson(this);
}
