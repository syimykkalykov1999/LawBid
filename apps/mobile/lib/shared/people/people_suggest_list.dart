import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/shared/people/people_suggest.dart';

export 'package:lawbid/shared/people/people_suggest.dart';

/// Owner 2026-10-21 (inbox 25 / 25b, Instagram): while a name or @username
/// is typed, the matching people of the whole app appear right under the
/// field — photo, name, @username; a tap picks the person. Nothing shows
/// under two characters. Loading, «nothing found» and errors are one quiet
/// line each.
///
/// The host owns the field and passes its text as [query]; the list waits
/// [peopleSuggestDebounce] and drops stale answers (see
/// [PeopleSuggestController]).
class PeopleSuggestList extends ConsumerStatefulWidget {
  const PeopleSuggestList({
    required this.query,
    required this.onPick,
    this.excludeIds = const {},
    this.selectedIds,
    this.busyId,
    this.enabled = true,
    this.scrollable = true,
    this.title,
    this.maxResults = 8,
    this.inset = AppSpacing.screenSide,
    super.key,
  });

  /// The typed text (a leading «@» is fine).
  final String query;
  final ValueChanged<SuggestedPerson> onPick;

  /// People not to suggest (already in, already listed above, …).
  final Set<String> excludeIds;

  /// When set, every row shows a tick circle (multi-select pickers).
  final Set<String>? selectedIds;

  /// The row being added right now shows a spinner.
  final String? busyId;
  final bool enabled;

  /// false = a plain column for a host that already scrolls.
  final bool scrollable;

  /// A small section title above the rows (only while there are rows).
  final String? title;
  final int maxResults;

  /// Side padding of the rows (0 inside a host that pads already).
  final double inset;

  @override
  ConsumerState<PeopleSuggestList> createState() => _PeopleSuggestListState();
}

class _PeopleSuggestListState extends ConsumerState<PeopleSuggestList> {
  late final PeopleSuggestController _c =
      PeopleSuggestController(ref.read(peopleSuggestSearchProvider))
        ..addListener(_changed)
        ..update(widget.query);

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(PeopleSuggestList old) {
    super.didUpdateWidget(old);
    if (old.query != widget.query) _c.update(widget.query);
  }

  @override
  void dispose() {
    _c
      ..removeListener(_changed)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_c.active) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final shown = [
      for (final p in _c.results)
        if (!widget.excludeIds.contains(p.id)) p,
    ].take(widget.maxResults).toList();

    Widget line(Widget child) => Padding(
          padding: EdgeInsets.symmetric(
            horizontal: widget.inset,
            vertical: AppSpacing.sm,
          ),
          child: child,
        );

    if (_c.error != null) {
      return line(
        Row(
          key: const ValueKey('people-suggest-error'),
          children: [
            Expanded(
              child: Text(
                errorText(t, _c.error!),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ),
            AppIconButton(
              compact: true,
              icon: AppIcon(AppIcons.refreshRounded, color: colors.iconTint),
              semanticLabel: t.t('common.retry'),
              onPressed: _c.retry,
            ),
          ],
        ),
      );
    }
    if (shown.isEmpty) {
      if (_c.loading) {
        return line(
          const Center(
            key: ValueKey('people-suggest-loading'),
            child: SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        );
      }
      return line(
        Text(
          t.t('search.empty.title'),
          key: const ValueKey('people-suggest-empty'),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: type.bodySmall.copyWith(color: colors.textSecondary),
        ),
      );
    }
    final selected = widget.selectedIds;
    final rows = <Widget>[
      if (widget.title != null)
        Padding(
          padding: EdgeInsetsDirectional.fromSTEB(
            widget.inset,
            AppSpacing.sm,
            widget.inset,
            AppSpacing.xs,
          ),
          child: Text(
            widget.title!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      for (final p in shown)
        PersonSuggestionTile(
          key: ValueKey('people-suggest-${p.id}'),
          person: p,
          inset: widget.inset,
          checked: selected?.contains(p.id),
          busy: widget.busyId == p.id,
          onTap: widget.enabled && widget.busyId == null
              ? () {
                  unawaited(HapticFeedback.selectionClick());
                  widget.onPick(p);
                }
              : null,
        ),
    ];
    // A tap on a row is not a "tap outside" of the field: the keyboard
    // stays up for the next name.
    return TextFieldTapRegion(
      child: widget.scrollable
          ? ListView(
              key: const ValueKey('people-suggest-list'),
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              children: rows,
            )
          : Column(mainAxisSize: MainAxisSize.min, children: rows),
    );
  }
}

/// One suggested person: photo, name, @username (Instagram / Telegram).
class PersonSuggestionTile extends StatelessWidget {
  const PersonSuggestionTile({
    required this.person,
    required this.onTap,
    this.checked,
    this.busy = false,
    this.avatarSize = 40,
    this.inset = AppSpacing.screenSide,
    super.key,
  });

  final SuggestedPerson person;
  final VoidCallback? onTap;

  /// null = no tick circle.
  final bool? checked;
  final bool busy;
  final double avatarSize;
  final double inset;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final url = person.avatarUrl;
    final handle = atHandle(person.username);
    final hasName = person.name.isNotEmpty;
    final showHandle = hasName && person.username.isNotEmpty;
    return Semantics(
      button: true,
      enabled: onTap != null || busy,
      selected: checked,
      label: showHandle ? '${person.name}, $handle' : person.title,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: inset,
              vertical: AppSpacing.xs,
            ),
            child: Row(
              children: [
                AppAvatar(
                  size: avatarSize,
                  initials: avatarInitials(
                    hasName ? person.name : person.username,
                  ),
                  imageProvider: url == null
                      ? null
                      : appNetworkImage(url, decodeWidthFor(avatarSize)),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              person.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: type.body.copyWith(
                                color: colors.text,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (person.verified) ...[
                            const SizedBox(width: AppSpacing.xs),
                            AppIcon(
                              AppIcons.verifiedRounded,
                              size: 14,
                              color: colors.iconTint,
                            ),
                          ],
                        ],
                      ),
                      if (showHandle)
                        Text(
                          handle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                if (busy) ...[
                  const SizedBox(width: AppSpacing.sm),
                  const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ] else if (checked != null) ...[
                  const SizedBox(width: AppSpacing.sm),
                  AppIcon(
                    checked!
                        ? AppIcons.checkCircleRounded
                        : AppIcons.radioButtonUncheckedRounded,
                    size: 22,
                    color: checked! ? colors.iconTint : colors.textSecondary,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
