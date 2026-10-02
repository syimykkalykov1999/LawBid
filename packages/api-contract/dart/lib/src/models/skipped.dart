// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'skipped.g.dart';

@JsonSerializable()
class Skipped {
  const Skipped({required this.id, required this.reason});

  factory Skipped.fromJson(Map<String, Object?> json) =>
      _$SkippedFromJson(json);

  final String id;
  final String reason;

  Map<String, Object?> toJson() => _$SkippedToJson(this);
}
