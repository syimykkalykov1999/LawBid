import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/case_history_controller.dart';
import 'package:lawbid/features/cases/presentation/widgets/reauth_gate_view.dart';

/// Detective R2B-12 (14.11): «Подтвердите, что это вы» right before a
/// sensitive download, as a sheet over the screen (the screen and its
/// state stay; Google Takeout and Telegram's data export ask again at the
/// download, not only at the request). The body is the frozen
/// [ReauthGateView] — password first, then the SMS code, the one-tap demo
/// path — so nothing new to learn. Returns the fresh reauth token, or null
/// when the person closes the sheet.
Future<String?> showReauthSheet(BuildContext context, {String? note}) =>
    showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ReauthSheet(note: note),
    );

class ReauthSheet extends ConsumerStatefulWidget {
  const ReauthSheet({this.note, super.key});

  final String? note;

  @override
  ConsumerState<ReauthSheet> createState() => _ReauthSheetState();
}

class _ReauthSheetState extends ConsumerState<ReauthSheet> {
  /// The token that was there when the sheet opened: only a NEW one closes
  /// it (a still-held, expired one must not). Read in [initState], not
  /// lazily: a lazy read would first happen inside the listener, after the
  /// new token is already there.
  String? _before;

  @override
  void initState() {
    super.initState();
    _before = ref.read(historyAccessProvider).token;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final access = ref.watch(historyAccessProvider);
    ref.listen(historyAccessProvider, (_, next) {
      final token = next.token;
      if (token != null && token != _before && next.isOpen) {
        Navigator.of(context).pop(token);
      }
    });
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AppSheetHandle(),
          Flexible(
            child: ReauthGateView(
              key: const ValueKey('reauth-sheet'),
              access: access,
              t: t,
              note: widget.note,
              inSheet: true,
            ),
          ),
        ],
      ),
    );
  }
}
