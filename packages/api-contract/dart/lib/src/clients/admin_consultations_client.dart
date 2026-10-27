// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_no_show_envelope.dart';
import '../models/admin_no_show_list_envelope.dart';
import '../models/resolve_no_show_dto.dart';
import '../models/state.dart';

part 'admin_consultations_client.g.dart';

@RestApi()
abstract class AdminConsultationsClient {
  factory AdminConsultationsClient(Dio dio, {String? baseUrl}) =
      _AdminConsultationsClient;

  /// Marks waiting for staff (default: disputed)
  @GET('/admin/consultation-no-shows')
  Future<AdminNoShowListEnvelope> listAdminNoShows({
    @Query('state') State? state = State.disputed,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Uphold or overturn a mark (needs step-up)
  @POST('/admin/consultation-no-shows/{id}/resolve')
  Future<AdminNoShowEnvelope> resolveNoShow({
    @Path('id') required String id,
    @Body() required ResolveNoShowDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
