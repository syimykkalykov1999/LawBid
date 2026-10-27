import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/platform/spotlight_index.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-27 (app indexing): the post a user saved can be found in
/// iPhone Spotlight. Only a published post of an attorney (never a client's
/// post); title and subtitle are what the card itself shows. The link is
/// the app link `/post/<id>`.
SpotlightItem? savedPostSpotlightItem(Post post, {required String host}) {
  if (post.author.isClient || post.isArchived || post.status != 'published') {
    return null;
  }
  final title = spotlightLine(post.title ?? '').isNotEmpty
      ? spotlightLine(post.title ?? '')
      : spotlightLine(post.body);
  if (title.isEmpty) return null;
  return SpotlightItem(
    url: savedPostSpotlightUrl(post.id, host: host),
    title: title,
    subtitle: post.author.displayName,
    domain: SpotlightDomain.post,
  );
}

String savedPostSpotlightUrl(String postId, {required String host}) =>
    'https://$host/post/${Uri.encodeComponent(postId)}';

/// A post was saved or un-saved by the user. Best effort; free off iOS.
void spotlightPostSaved(Ref ref, Post post, {required bool saved}) {
  if (!spotlightSupported) return;
  try {
    final host = ref.read(appEnvironmentProvider).deepLinkHost;
    if (saved) {
      spotlightAdd(ref, savedPostSpotlightItem(post, host: host));
    } else {
      spotlightRemove(ref, savedPostSpotlightUrl(post.id, host: host));
    }
  } on Object {
    // Nothing to index.
  }
}
