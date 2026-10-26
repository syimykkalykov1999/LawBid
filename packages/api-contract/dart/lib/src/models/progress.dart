// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'progress.g.dart';

@JsonSerializable()
class Progress {
  const Progress({this.rows, this.bytes});

  factory Progress.fromJson(Map<String, Object?> json) =>
      _$ProgressFromJson(json);

  final int? rows;
  final int? bytes;

  Map<String, Object?> toJson() => _$ProgressToJson(this);
}
