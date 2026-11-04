# R-112: цвет окна под Flutter = фон темы (2026-11-03)

- Причина (гипотеза, помощник доказал что Flutter сам не рисует белое): окно Android под Flutter берёт `?android:colorBackground` (белый), iOS LaunchScreen белый.
- Сделано: Dart пишет `design_system.window_bg` (#AARRGGBB) при выборе темы и один раз при чтении старого значения; `MainActivity.onCreate` и `AppDelegate` красят окно этим цветом; LaunchScreen.storyboard = Blue (#003B70).
- Тест: `test/core/design_system/theme_window_bg_test.dart`.
- Не проверено: сборка Android/iOS и телефон (RAM Мака).
