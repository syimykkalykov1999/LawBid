import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/uploads/application/composer_photo.dart';
import 'package:lawbid/features/uploads/application/upload_queue.dart';

/// Owner 2026-10-08: a post with photos publishes in the upload queue —
/// it waits for (or retries) each photo, then creates the post. [draft]
/// carries everything but the photo ids.
Future<Post> publishPostWithPhotos(
  Ref ref,
  PostDraft draft,
  List<ComposerPhoto> photos,
  UploadProgress progress,
) async {
  final actions = ref.read(socialActionsProvider);
  final steps = StepProgress(progress, [0.9, 0.1]);
  final ids = <String>[];
  for (var i = 0; i < photos.length; i++) {
    ids.add(await photos[i].upload(actions));
    steps.step(0, (i + 1) / photos.length);
  }
  final post = await ref.read(socialRepositoryProvider).createPost(
        PostDraft(
          title: draft.title,
          body: draft.body,
          practiceCode: draft.practiceCode,
          isNews: draft.isNews,
          markedLegal: draft.markedLegal,
          mediaFileIds: ids,
          attachments: draft.attachments,
        ),
      );
  steps.step(1, 1);
  afterPostPublished(ref, post);
  return post;
}

/// The feed shows the new post on top; the author's profile grids and
/// post counters follow at once.
void afterPostPublished(Ref ref, Post post) {
  if (ref.exists(feedProvider)) {
    ref.read(feedProvider.notifier).prepend(post);
  }
  ref
    ..invalidate(attorneyPostsProvider(post.author.id))
    ..invalidate(attorneyNewsProvider(post.author.id))
    ..invalidate(publicAttorneyProfileProvider)
    ..invalidate(publicClientProfileProvider);
}
