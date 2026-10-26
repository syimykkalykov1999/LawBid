// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'file_view_dto.dart';
import 'response_meta_dto.dart';

part 'file_view_list_envelope.g.dart';

@JsonSerializable()
class FileViewListEnvelope {
  const FileViewListEnvelope({required this.data, this.meta});

  factory FileViewListEnvelope.fromJson(Map<String, Object?> json) =>
      _$FileViewListEnvelopeFromJson(json);

  final List<FileViewDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$FileViewListEnvelopeToJson(this);
}
