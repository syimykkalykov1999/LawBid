import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_inner.dart';
import 'package:lawbid/features/social/social_routes.dart';

/// Owner 2026-10-13: the inside of a reel ("Смотреть" under the video) is
/// the same inner card as an opened post: header with Follow, tabs
/// Overview | Documents, the player with views and duration.
class ReelDetailScreen extends ConsumerWidget {
  const ReelDetailScreen({required this.post, super.key});

  final Post post;

  /// Owner 2026-10-13: one reel = one inner card — from Posts and from the
  /// Reels player the same page (by the post's id) opens.
  static Future<void> open(BuildContext context, Post post) =>
      context.push<void>(SocialRoutes.post(post.id));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(bottom: false, child: PostInnerCard(post: post)),
    );
  }
}
