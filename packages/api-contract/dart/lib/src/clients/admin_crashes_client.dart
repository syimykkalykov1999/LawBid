// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/crash_detail_envelope.dart';
import '../models/crash_group_list_envelope.dart';

part 'admin_crashes_client.g.dart';

@RestApi()
abstract class AdminCrashesClient {
  factory AdminCrashesClient(Dio dio, {String? baseUrl}) = _AdminCrashesClient;

  /// Crashes grouped, most frequent first
  @GET('/admin/crashes')
  Future<CrashGroupListEnvelope> listCrashGroups({
    @Query('days') num? days = 7,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One crash: stack, versions, systems, phones
  @GET('/admin/crashes/{fingerprint}')
  Future<CrashDetailEnvelope> getCrashDetail({
    @Path('fingerprint') required String fingerprint,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark fixed: clears the group
  @DELETE('/admin/crashes/{fingerprint}')
  Future<void> resolveCrash({
    @Path('fingerprint') required String fingerprint,
    @Extras() Map<String, dynamic>? extras,
  });
}
