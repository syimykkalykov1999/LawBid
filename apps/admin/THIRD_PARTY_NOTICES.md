# Third-party notices (apps/admin)

Packages taken whole (RULE #1), pinned in `package.json` / `package-lock.json`.
The MIT licence asks only that the copyright and permission notice travel with
the code; here they are.

## browser-image-compression 2.0.2 — MIT

Shrinks sticker / gift pictures in the browser before upload
(`src/lib/image-compress.ts`). https://github.com/Donaldcwl/browser-image-compression

MIT License — Copyright (c) 2019 Donald Chan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions: The above copyright
notice and this permission notice shall be included in all copies or
substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### uzip 0.20201231.0 — MIT (dependency of browser-image-compression)

MIT License — Copyright (c) 2018 Photopea. Same permission notice as above.

## @tanstack/react-virtual 3.14.25, @tanstack/virtual-core 3.19.10 — MIT

Window-scroll virtualisation of long admin journals (`src/components/ui/virtual-rows.tsx`).
https://github.com/TanStack/virtual

MIT License — Copyright (c) 2021-present Tanner Linsley. Same permission
notice as above.

## Calmer motion (owner row 88, 2026-11-13): code and numbers copied, no package added

- **next-themes** — `disableAnimation` (the code behind `disableTransitionOnChange`),
  copied into `src/lib/theme.tsx`. https://github.com/pacocoursey/next-themes
  MIT License — Copyright (c) 2022 Paco Coursey.
- **sonner** — swipe-to-dismiss threshold (45 px) and velocity (0.11 px/ms) and
  the 16 px phone offset, in `src/components/ui/toast.tsx`. https://github.com/emilkowalski/sonner
  MIT License — Copyright (c) 2023 Emil Kowalski.
- **shadcn/ui** — sidebar collapse on one CSS clock (`transition-[width]
  duration-200 ease-linear`), in `src/components/shell/app-shell.tsx`; Skeleton
  = opacity pulse. https://github.com/shadcn-ui/ui
  MIT License — Copyright (c) 2023 shadcn.
- **Tailwind CSS** — the `animate-pulse` keyframes and timing (2 s,
  cubic-bezier(0.4, 0, 0.6, 1), opacity 0.5), as `skeleton-pulse` in
  `src/app/globals.css`. https://github.com/tailwindlabs/tailwindcss
  MIT License — Copyright (c) Tailwind Labs, Inc.

Same permission notice as above.
