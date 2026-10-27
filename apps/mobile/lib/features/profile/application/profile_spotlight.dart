import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/platform/spotlight_index.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

/// Owner 2026-10-27 (app indexing): what iPhone Spotlight shows for an
/// attorney profile the user opened — the same facts the public page shows
/// (name, practices, licensed states), nothing else. Null = not indexed:
/// the user's own profile, or a profile of someone blocked either way.
///
/// The link is the canonical public page (`/attorneys/<username>/`) when
/// the server sends one, else the app link `/lawyer/<username>`; both open
/// the profile in the app through the deep-link router.
SpotlightItem? attorneySpotlightItem(
  PublicAttorneyProfile p, {
  required String host,
}) {
  if (p.isSelf || p.isBlocked || p.hasBlockedMe) return null;
  final canonical = p.publicUrl?.trim();
  final url = canonical != null &&
          canonical.isNotEmpty &&
          (Uri.tryParse(canonical)?.isScheme('https') ?? false)
      ? canonical
      : 'https://$host/lawyer/${Uri.encodeComponent(p.username)}';
  final name = p.fullName;
  final practices = p.practices.map((x) => x.nameEn).take(2).join(', ');
  final states = p.licensedStates.map((s) => s.code).take(3).join(', ');
  return SpotlightItem(
    url: url,
    title: name.isEmpty ? '@${p.username}' : name,
    subtitle: [
      'Attorney',
      if (practices.isNotEmpty) practices,
      if (states.isNotEmpty) states,
    ].join(' · '),
    domain: SpotlightDomain.attorney,
  );
}

/// Called when a profile has just been read for the user. Best effort; the
/// first thing it checks is the platform, so it costs nothing off iOS.
void indexViewedAttorney(Ref ref, PublicAttorneyProfile profile) {
  if (!spotlightSupported) return;
  try {
    final host = ref.read(appEnvironmentProvider).deepLinkHost;
    spotlightAdd(ref, attorneySpotlightItem(profile, host: host));
  } on Object {
    // The provider was disposed while the profile loaded: nothing to index.
  }
}
