import 'package:flutter/material.dart';

/// Owner 2026-11-04 (R-391): a bottom sheet («Фильтры») opened over the
/// empty state «Вопросов нет» and the block jumped up, then slid back down.
/// Opening a route drops the keyboard (see `UnfocusOnNavigateObserver`) and
/// the system reports its height shrinking frame by frame (or a stale value
/// once); every Scaffold below follows `viewInsets.bottom` and re-centres
/// its content — under the scrim, but visibly.
///
/// While another route (a sheet, a dialog, a pushed page) covers this
/// subtree, it keeps seeing the bottom insets it had at the moment it was
/// covered, so nothing beneath a sheet ever moves. The sheet itself lives on
/// the route above and keeps the live values (its own keyboard still lifts
/// it). When the cover is gone the live values apply again.
class StableUnderCover extends StatefulWidget {
  const StableUnderCover({required this.child, super.key});

  final Widget child;

  @override
  State<StableUnderCover> createState() => _StableUnderCoverState();
}

class _StableUnderCoverState extends State<StableUnderCover> {
  double? _insetsBottom;
  double? _paddingBottom;
  double? _viewPaddingBottom;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final covered = !(ModalRoute.of(context)?.isCurrent ?? true);
    if (!covered || _insetsBottom == null) {
      _insetsBottom = media.viewInsets.bottom;
      _paddingBottom = media.padding.bottom;
      _viewPaddingBottom = media.viewPadding.bottom;
    }
    // Same widget shape covered or not, so the subtree keeps its state.
    return MediaQuery(
      data: covered
          ? media.copyWith(
              viewInsets: media.viewInsets.copyWith(bottom: _insetsBottom),
              padding: media.padding.copyWith(bottom: _paddingBottom),
              viewPadding:
                  media.viewPadding.copyWith(bottom: _viewPaddingBottom),
            )
          : media,
      child: widget.child,
    );
  }
}
