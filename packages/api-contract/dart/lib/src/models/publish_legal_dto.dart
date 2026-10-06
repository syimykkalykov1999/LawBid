// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'publish_legal_dto.g.dart';

@JsonSerializable()
class PublishLegalDto {
  const PublishLegalDto({this.changeNote, this.requiresReacceptance = true});

  factory PublishLegalDto.fromJson(Map<String, Object?> json) =>
      _$PublishLegalDtoFromJson(json);

  /// Ask users who accepted an older version to accept this one again (material change). Default on.
  final bool requiresReacceptance;
  final String? changeNote;

  Map<String, Object?> toJson() => _$PublishLegalDtoToJson(this);
}
