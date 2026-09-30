import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show BounceIcon;
import 'package:lawbid/features/social/application/social_providers.dart'
    show socialRepositoryProvider;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// `https://lawbid.app/case/:id` — opens the attorney case screen.
String caseLink(String host, String caseId) =>
    'https://$host/case/${Uri.encodeComponent(caseId)}';

/// Owner 2026-09-30 (OQ-034): the case card's bottom row, like a post's —
/// comments (with count), share, then the time and Save.
class CaseActionsBar extends ConsumerStatefulWidget {
  const CaseActionsBar({required this.item, super.key});

  final FeedCase item;

  @override
  ConsumerState<CaseActionsBar> createState() => _CaseActionsBarState();
}

class _CaseActionsBarState extends ConsumerState<CaseActionsBar> {
  bool? _saved;

  /// Shares made from this card (added to the server count at once).
  int _shared = 0;

  Future<void> _toggleSave() async {
    final t = ref.read(translatorProvider);
    final next = !(_saved ?? widget.item.isSaved);
    setState(() => _saved = next);
    try {
      await ref.read(caseActionsProvider).setSaved(widget.item.id, saved: next);
      if (mounted) {
        showAppSnackBar(
            context, t.t(next ? 'cases.saved.added' : 'cases.saved.removed'));
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _saved = !next);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _share() async {
    final box = context.findRenderObject() as RenderBox?;
    final result = await SharePlus.instance.share(ShareParams(
      uri: Uri.parse(caseLink(
          ref.read(appEnvironmentProvider).deepLinkHost, widget.item.id)),
      sharePositionOrigin:
          box == null ? null : box.localToGlobal(Offset.zero) & box.size,
    ));
    // OQ-037: count it unless the sheet was just closed.
    if (result.status == ShareResultStatus.dismissed || !mounted) return;
    setState(() => _shared++);
    try {
      await ref.read(socialRepositoryProvider).recordCaseShare(widget.item.id);
    } on Object {
      if (mounted) setState(() => _shared--);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final saved = _saved ?? widget.item.isSaved;
    final count = widget.item.commentCount;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: Row(
        children: [
          BounceIcon(
            active: false,
            icon: Icons.mode_comment_outlined,
            activeIcon: Icons.mode_comment_outlined,
            label: t.t('cases.comments.title'),
            onTap: () => context.push(AppRoutes.caseComments(widget.item.id)),
          ),
          if (count > 0)
            Text(
              SocialFormat.count(f, count),
              style: type.bodySmall
                  .copyWith(color: colors.text, fontWeight: FontWeight.w600),
            ),
          BounceIcon(
            active: false,
            icon: Icons.send_outlined,
            activeIcon: Icons.send_outlined,
            label: t.t('post.share'),
            onTap: _share,
          ),
          if (widget.item.shareCount + _shared > 0)
            Text(
              SocialFormat.count(f, widget.item.shareCount + _shared),
              style: type.bodySmall
                  .copyWith(color: colors.text, fontWeight: FontWeight.w600),
            ),
          // Owner 2026-09-30: the time and Save sit at the right edge.
          Expanded(
            child: Text(
              SocialFormat.ago(t, f, widget.item.createdAt),
              maxLines: 1,
              textAlign: TextAlign.right,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
          BounceIcon(
            active: saved,
            icon: Icons.bookmark_border_rounded,
            activeIcon: Icons.bookmark_rounded,
            activeColor: colors.gold,
            label: t.t(saved ? 'post.unsave' : 'post.save'),
            onTap: _toggleSave,
          ),
        ],
      ),
    );
  }
}
