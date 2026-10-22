import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-22 (client economy plan, package G): the app starts with
/// **one** `GET /me/session` — me, badges, flags, the config version,
/// unread support tickets, «a call is running» — instead of `/users/me`,
/// `/badges` and `/config/bootstrap` one after the other. The HTTP cache
/// keeps the last answer on disk and asks with `If-None-Match`, so an
/// unchanged state is a 304 with no body.
class AppSessionLoader {
  AppSessionLoader(this._users);

  final api.UsersClient _users;

  Future<api.AppSessionDto> load() async =>
      (await guardApiCall(_users.getSession)).data;
}

final appSessionLoaderProvider = Provider<AppSessionLoader>(
  (ref) => AppSessionLoader(api.UsersClient(ref.watch(dioProvider))),
);

/// The last `GET /me/session` of this process (null before it landed or
/// when it failed). Badges, the support dot and the flags read it first.
class AppSessionHolder extends Notifier<api.AppSessionDto?> {
  @override
  api.AppSessionDto? build() => null;

  // ignore: use_setters_to_change_properties
  void set(api.AppSessionDto? session) => state = session;
}

final appSessionProvider =
    NotifierProvider<AppSessionHolder, api.AppSessionDto?>(
  AppSessionHolder.new,
);

/// True while the splash is fetching `/me/session`: `CurrentUserController`
/// must not fire its own `GET /users/me` when the session appears — the
/// splash applies `me` from the one answer (or falls back to that GET).
class StartupProvidesMe extends Notifier<bool> {
  @override
  bool build() => false;

  // ignore: avoid_positional_boolean_parameters, use_setters_to_change_properties
  void set(bool value) => state = value;
}

final startupProvidesMeProvider =
    NotifierProvider<StartupProvidesMe, bool>(StartupProvidesMe.new);
