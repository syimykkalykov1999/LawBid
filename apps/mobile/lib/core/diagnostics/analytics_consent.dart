import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-22 (audit #4 §5): Settings → Privacy → «Usage statistics».
/// The state is this device's answer ([AppEvents.consent], kept in sync
/// with the account by `GET /users/me`); [set] records the new answer on
/// the server (`POST /users/me/consents`, append-only like every consent)
/// and only then switches the events.
class AnalyticsConsentController extends Notifier<bool> {
  @override
  bool build() => AppEvents.consent ?? false;

  Future<void> set({required bool granted}) async {
    final users = api.UsersClient(ref.read(dioProvider));
    await guardApiCall(
      () => users.saveConsents(
        body: api.SaveConsentsDto(
          consents: [
            api.ConsentItemDto(
              type: api.ConsentItemDtoType.analytics,
              granted: granted,
            ),
          ],
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    );
    AppEvents.setConsent(granted: granted);
    state = granted;
  }
}

final analyticsConsentProvider =
    NotifierProvider<AnalyticsConsentController, bool>(
  AnalyticsConsentController.new,
);
