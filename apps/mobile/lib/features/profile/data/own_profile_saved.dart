import 'package:lawbid/features/profile/data/profile_mappers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/social/data/saved_json.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20 (speed, Telegram): my own profile (attorney or client)
/// kept on the phone ([SavedJson]), so the screen opens on it at once and
/// the live profile replaces it in the background.
class OwnProfileSaved {
  const OwnProfileSaved(this._saved);

  final SavedJson _saved;

  static const _attorney = 'profile.attorney';
  static const _client = 'profile.client';

  void saveAttorney(api.OwnAttorneyProfileEnvelope e) =>
      _saved.save(_attorney, e.toJson());

  void saveClient(api.ClientProfileEnvelope e) =>
      _saved.save(_client, e.toJson());

  Future<OwnAttorneyProfile?> attorney() async {
    final json = await _saved.read(_attorney);
    if (json == null) return null;
    try {
      return ProfileMappers.ownProfile(
        api.OwnAttorneyProfileEnvelope.fromJson(json).data,
      );
    } on Object {
      return null;
    }
  }

  Future<ClientProfileDetails?> client() async {
    final json = await _saved.read(_client);
    if (json == null) return null;
    try {
      return ProfileMappers.client(
        api.ClientProfileEnvelope.fromJson(json).data,
      );
    } on Object {
      return null;
    }
  }
}
