import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart';
import 'package:lawbid/features/profile/presentation/widgets/star_rating.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// Desktop web plan 2026-10-28 §6.5: on a desktop window a profile page is
/// the profile itself (header + tabs, at most [kProfileMainMaxWidth]) and a
/// supporting pane at its end — the counters, the rating and, on one's own
/// profile, shortcuts. It is the same [SupportingPaneLayout] the feed uses.
/// Under the desktop width [page] is returned as it is.
///
/// [username] is the attorney whose profile [page] shows; [client] marks
/// the person's own client profile. With neither (a guest, a loading user)
/// there is nothing to put in the pane and [page] stays in the 680 column.
class ProfileAdaptivePage extends StatelessWidget {
  const ProfileAdaptivePage({
    required this.page,
    this.username,
    this.client = false,
    super.key,
  });

  final Widget page;
  final String? username;
  final bool client;

  @override
  Widget build(BuildContext context) {
    if (!isDesktopWindow(context)) return page;
    final name = username;
    if (name == null && !client) {
      return ContentColumn(maxWidth: kShellContentMaxWidth, child: page);
    }
    return SupportingPaneLayout(
      main: page,
      pane: name != null
          ? AttorneyProfilePane(username: name)
          : const ClientProfilePane(),
      mainMaxWidth: kProfileMainMaxWidth,
      paneMinWidth: kShellDesktopMinWidth,
    );
  }
}

/// The frame of both panes: the page colour, a hairline at the start edge.
class _PaneFrame extends StatelessWidget {
  const _PaneFrame({required this.child, this.paneKey});

  final Key? paneKey;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return DecoratedBox(
      key: paneKey,
      decoration: BoxDecoration(
        color: colors.bg,
        border: BorderDirectional(start: BorderSide(color: colors.border)),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [child],
        ),
      ),
    );
  }
}

/// One «label … value» line of a pane.
class _StatRow extends StatelessWidget {
  const _StatRow({required this.label, required this.value});

  final String label;
  final Widget value;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
          ),
          value,
        ],
      ),
    );
  }
}

Widget _number(BuildContext context, String text) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final type = Theme.of(context).extension<AppTypographyTokens>()!;
  return Text(
    text,
    style: type.body.copyWith(color: colors.text, fontWeight: FontWeight.w700),
  );
}

/// An attorney's profile pane: counters, rating, and for one's own profile
/// the shortcuts that sit in the phone's header and Settings.
class AttorneyProfilePane extends ConsumerWidget {
  const AttorneyProfilePane({required this.username, super.key});

  final String username;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final p = ref.watch(publicAttorneyProfileProvider(username)).value;
    if (p == null) {
      return const _PaneFrame(
        paneKey: ValueKey('desktop-profile-pane'),
        child: SizedBox.shrink(),
      );
    }
    final followers = ref.watch(
          followerCountsProvider.select((m) => m[p.id]),
        ) ??
        p.counters.followers;
    return _PaneFrame(
      paneKey: const ValueKey('desktop-profile-pane'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _StatRow(
            label: t.t('profile.counters.posts'),
            value:
                _number(context, SocialFormat.count(formats, p.counters.posts)),
          ),
          _StatRow(
            label: t.t('profile.counters.followers'),
            value: _number(context, SocialFormat.count(formats, followers)),
          ),
          _StatRow(
            label: t.t('profile.counters.following'),
            value: _number(
              context,
              SocialFormat.count(formats, p.counters.following),
            ),
          ),
          _RatingRow(rating: p.rating),
          if (p.isSelf) ...[
            const SizedBox(height: AppSpacing.lg),
            _Shortcut(
              icon: AppIcons.editOutlined,
              label: t.t('profile.action.edit'),
              onTap: () => context.push(AppRoutes.profileEdit),
            ),
            _Shortcut(
              icon: AppIcons.insightsOutlined,
              label: t.t('stats.title'),
              onTap: () => context.push(AppRoutes.myStats),
            ),
            _Shortcut(
              icon: AppIcons.settingsOutlined,
              label: t.t('settings.title'),
              onTap: () => context.push(AppRoutes.profileSettings),
            ),
          ],
        ],
      ),
    );
  }
}

/// The rating line: stars and the average with the review count, or «New».
class _RatingRow extends ConsumerWidget {
  const _RatingRow({required this.rating});

  final RatingInfo rating;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    if (rating.isNew) {
      return _StatRow(
        label: t.t('profile.tab.reviews'),
        value: Text(
          t.t('profile.rating.new'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      );
    }
    return _StatRow(
      label: t.t('profile.tab.reviews'),
      value: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          StarRatingDisplay(value: rating.average ?? 0, size: AppSpacing.md),
          const SizedBox(width: AppSpacing.sm),
          _number(context, ratingNumber(formats, t, rating.average)),
        ],
      ),
    );
  }
}

/// The client's own profile pane: shortcuts only (a client has no public
/// counters or rating).
class ClientProfilePane extends ConsumerWidget {
  const ClientProfilePane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return _PaneFrame(
      paneKey: const ValueKey('desktop-profile-pane'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Shortcut(
            icon: AppIcons.editOutlined,
            label: t.t('profile.action.edit'),
            onTap: () => context.push(AppRoutes.profileEdit),
          ),
          _Shortcut(
            icon: AppIcons.folderOpenRounded,
            label: t.t('profile.client.myCases'),
            onTap: () => context.go(AppRoutes.mine),
          ),
          _Shortcut(
            icon: AppIcons.settingsOutlined,
            label: t.t('settings.title'),
            onTap: () => context.push(AppRoutes.profileSettings),
          ),
        ],
      ),
    );
  }
}

class _Shortcut extends StatelessWidget {
  const _Shortcut({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) =>
      AppListRow(icon: icon, label: label, onTap: onTap, flush: true);
}
