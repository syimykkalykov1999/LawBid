import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';

/// Owner 2026-10-02 — "Have a promo code?" at checkout: collapsed link,
/// then a field with Apply; the discount is spelled out once it is valid.
/// [onChanged] gets the validated code (null when none / removed).
class PromoCodeField extends StatefulWidget {
  const PromoCodeField({
    required this.t,
    required this.formats,
    required this.plan,
    required this.validate,
    required this.onChanged,
    super.key,
  });

  final Translator t;
  final L10nFormats formats;
  final SubscriptionPlan plan;
  final Future<PromoCheck> Function(String code, SubscriptionPlan plan)
      validate;
  final ValueChanged<String?> onChanged;

  @override
  State<PromoCodeField> createState() => _PromoCodeFieldState();
}

class _PromoCodeFieldState extends State<PromoCodeField> {
  final _c = TextEditingController();
  bool _open = false;
  bool _busy = false;
  String? _applied;
  String? _text;
  bool _error = false;
  SubscriptionPlan? _checkedFor;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(PromoCodeField old) {
    super.didUpdateWidget(old);
    // A code valid for one plan may not be for the other: check again.
    if (_applied != null && widget.plan != _checkedFor) {
      final code = _applied!;
      setState(() {
        _applied = null;
        _text = null;
      });
      widget.onChanged(null);
      _c.text = code;
      _apply();
    }
  }

  String _describe(PromoCheck r) {
    final t = widget.t;
    if (r.percentOff != null) {
      return t.t('promo.percent', {'percent': '${r.percentOff}'});
    }
    if (r.amountOffCents != null) {
      return t.t('promo.amount', {
        'amount': widget.formats.currencyFromCents(r.amountOffCents!),
      });
    }
    if (r.freeDays != null) {
      return t.t('promo.days', {'days': '${r.freeDays}'});
    }
    return t.t('promo.applied');
  }

  Future<void> _apply() async {
    final code = _c.text.trim().toUpperCase();
    if (code.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = false;
    });
    try {
      final r = await widget.validate(code, widget.plan);
      if (!mounted) return;
      if (r.valid) {
        setState(() {
          _applied = code;
          _checkedFor = widget.plan;
          _text = _describe(r);
          _busy = false;
        });
        widget.onChanged(code);
      } else {
        setState(() {
          _applied = null;
          _text = widget.t.t('promo.reason.${r.reason ?? 'not_found'}');
          _error = true;
          _busy = false;
        });
        widget.onChanged(null);
      }
    } on Object {
      if (!mounted) return;
      setState(() {
        _text = widget.t.t('promo.checkFailed');
        _error = true;
        _busy = false;
      });
      widget.onChanged(null);
    }
  }

  void _remove() {
    _c.clear();
    setState(() {
      _applied = null;
      _text = null;
      _error = false;
    });
    widget.onChanged(null);
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    if (!_open) {
      return Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: () => setState(() => _open = true),
          icon: AppIcon(
            AppIcons.sellOutlined,
            color: colors.goldDark,
            size: 18,
          ),
          label: Text(
            t.t('promo.have'),
            style: type.bodySmall.copyWith(color: colors.goldDark),
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: AppTextField(
                controller: _c,
                hintText: t.t('promo.hint'),
                semanticLabel: t.t('promo.hint'),
                enabled: _applied == null && !_busy,
                textCapitalization: TextCapitalization.characters,
                maxLength: 40,
                onSubmitted: (_) => _apply(),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            SizedBox(
              width: 104,
              child: _applied == null
                  ? AppButton(
                      label: t.t('promo.apply'),
                      variant: AppButtonVariant.secondary,
                      isLoading: _busy,
                      onPressed: _apply,
                    )
                  : AppButton(
                      label: t.t('promo.remove'),
                      variant: AppButtonVariant.secondary,
                      onPressed: _remove,
                    ),
            ),
          ],
        ),
        if (_text != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Row(
              children: [
                AppIcon(
                  _error
                      ? AppIcons.errorOutlineRounded
                      : AppIcons.checkCircleRounded,
                  size: 16,
                  color: _error ? colors.danger : colors.success,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _text!,
                    style: type.caption.copyWith(
                      color: _error ? colors.danger : colors.success,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
