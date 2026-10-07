import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/presentation/demo_actions.dart';

/// Length of an admin-issued demo invite code (docs/ops/demo-world.md).
const demoCodeLength = 8;

/// Letters and digits only, upper case, at most [demoCodeLength].
class DemoCodeFormatter extends TextInputFormatter {
  const DemoCodeFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final raw = newValue.text.toUpperCase().replaceAll(RegExp('[^0-9A-Z]'), '');
    final text =
        raw.length > demoCodeLength ? raw.substring(0, demoCodeLength) : raw;
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Owner 2026-10-05 (docs/ops/demo-world.md): welcome screen → «У меня есть
/// демо-код» → this sheet: 8-character code, «Войти» →
/// `POST /demo/invites/redeem` → the demo session opens (no LawBid
/// account needed — a blogger).
class DemoCodeSheet extends ConsumerStatefulWidget {
  const DemoCodeSheet({super.key});

  static Future<void> show(BuildContext context) => showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => const DemoCodeSheet(),
      );

  @override
  ConsumerState<DemoCodeSheet> createState() => _DemoCodeSheetState();
}

class _DemoCodeSheetState extends ConsumerState<DemoCodeSheet> {
  final _code = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _code.text.trim();
    if (code.length != demoCodeLength || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final t = ref.read(translatorProvider);
    try {
      final session = await ref.read(demoRepositoryProvider).redeem(code);
      if (!mounted) return;
      Navigator.of(context).pop();
      await enterDemoAndGo(context, ref, session);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = errorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final complete = _code.text.length == demoCodeLength;
    return SafeArea(
      top: false,
      child: Padding(
        // Keyboard inset: the field and the button stay visible above it.
        padding: EdgeInsets.only(
          left: AppSpacing.screenSide,
          right: AppSpacing.screenSide,
          top: AppSpacing.md,
          bottom: AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Semantics(
              header: true,
              child: Text(
                t.t('demo.code.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('demo.code.body'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              key: const ValueKey('demo-code-field'),
              controller: _code,
              label: t.t('demo.code.field'),
              hintText: 'XXXXXXXX',
              autofocus: true,
              enabled: !_busy,
              textCapitalization: TextCapitalization.characters,
              keyboardType: TextInputType.visiblePassword,
              inputFormatters: const [DemoCodeFormatter()],
              leading: const AppIcon(AppIcons.keyboardRounded),
              errorText: _error,
              textInputAction: TextInputAction.go,
              onSubmitted: (_) => _submit(),
              onChanged: (_) => setState(() => _error = null),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('demo-code-submit'),
              label: t.t('demo.code.submit'),
              isLoading: _busy,
              disabledHint: t.t('form.disabled.code'),
              isEnabled: complete,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
