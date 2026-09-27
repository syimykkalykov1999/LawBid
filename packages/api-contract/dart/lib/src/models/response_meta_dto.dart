// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'response_meta_dto.g.dart';

@JsonSerializable()
class ResponseMetaDto {
  const ResponseMetaDto({this.nextCursor});

  factory ResponseMetaDto.fromJson(Map<String, Object?> json) =>
      _$ResponseMetaDtoFromJson(json);

  /// Opaque cursor for the next page; null on the last page.
  final String? nextCursor;

  Map<String, Object?> toJson() => _$ResponseMetaDtoToJson(this);
}
