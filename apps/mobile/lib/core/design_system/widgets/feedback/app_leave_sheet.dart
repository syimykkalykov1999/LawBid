import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/pop_if_current.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:material_ui/material_ui.dart';

/// What the person picked when leaving an editor with unsaved work.
enum LeaveChoice { save, discard, stay }

/// Row 109 (Instagram «Save draft? / Discard», iOS Contacts «Discard
/// Changes»): the sheet shown when an editor with unsaved work is closed.
/// [saveLabel] adds the «Save draft» button (omit it where nothing can be
/// kept, as in Edit profile). Closing the sheet keeps the person editing.
Future<LeaveChoice> showLeaveSheet(
  BuildContext context, {
  required String title,
  required String message,
  required String discardLabel,
  required String stayLabel,
  String? saveLabel,
}) async {
  final picked = await showAppBottomSheet<LeaveChoice>(
    context: context,
    builder: (context) {
      final colors = Theme.of(context).extension<AppColorTokens>()!;
      final typography = Theme.of(context).extension<AppTypographyTokens>()!;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AppSheetHandle(),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: typography.body.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.xl),
                if (saveLabel != null) ...[
                  AppButton(
                    key: const ValueKey('leave-save'),
                    label: saveLabel,
                    onPressed: () =>
                        Navigator.of(context).pop(LeaveChoice.save),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                ],
                AppButton(
                  key: const ValueKey('leave-discard'),
                  label: discardLabel,
                  variant: AppButtonVariant.danger,
                  onPressed: () =>
                      Navigator.of(context).pop(LeaveChoice.discard),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  key: const ValueKey('leave-stay'),
                  label: stayLabel,
                  variant: AppButtonVariant.secondary,
                  onPressed: () => Navigator.of(context).pop(LeaveChoice.stay),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
  return picked ?? LeaveChoice.stay;
}

/// Row 109 (Gmail / Telegram «Undo»): a message with «Undo» that stays for
/// the admin's undo window (`client.undo_window_s`, passed as [window]).
/// [onUndo] runs when it is tapped; [onTimeout] runs once the window ended
/// without it (a delete that only reaches the server then). Both are
/// independent of the screen, which may be gone by then.
void showUndoSnackBar(
  BuildContext context, {
  required String message,
  required String undoLabel,
  required Duration window,
  required VoidCallback onUndo,
  VoidCallback? onTimeout,
}) {
  var undone = false;
  showAppSnackBar(
    context,
    message,
    actionLabel: undoLabel,
    duration: window,
    onAction: () {
      if (undone) return;
      undone = true;
      onUndo();
    },
  );
  if (onTimeout == null) return;
  Future<void>.delayed(window, () {
    if (undone) return;
    undone = true;
    onTimeout();
  });
}

/// Row 109 (iOS Contacts, Instagram Edit profile «Discard changes?»): back,
/// the edge swipe and the top bar's back button ask first while [isDirty]
/// says there are unsaved changes. [listenable] (the form's text
/// controllers) re-checks it as the person types.
class UnsavedChangesGuard extends StatelessWidget {
  const UnsavedChangesGuard({
    required this.isDirty,
    required this.listenable,
    required this.title,
    required this.message,
    required this.discardLabel,
    required this.stayLabel,
    required this.child,
    super.key,
  });

  final bool Function() isDirty;
  final Listenable listenable;
  final String title;
  final String message;
  final String discardLabel;
  final String stayLabel;
  final Widget child;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: listenable,
        builder: (context, child) => PopScope(
          canPop: !isDirty(),
          onPopInvokedWithResult: (didPop, _) async {
            if (didPop) return;
            final choice = await showLeaveSheet(
              context,
              title: title,
              message: message,
              discardLabel: discardLabel,
              stayLabel: stayLabel,
            );
            if (choice == LeaveChoice.discard &&
                context.mounted &&
                context.isCurrentRoute) {
              context.safeLeave<void>();
            }
          },
          child: child!,
        ),
        child: child,
      );
}
