// Lint only the staged API files (the whole-tree `npm run lint` took minutes
// and up to 8 GB per commit and froze the Mac when several ran at once).
// `npm exec --workspace apps/api` runs ESLint from apps/api so its flat
// config and type-aware parser options apply.
const quote = (f) => `'${f.replace(/'/g, "'\\''")}'`;

export default {
  'apps/api/**/*.ts': (files) =>
    `npm exec --workspace apps/api -- eslint --fix --no-warn-ignored ${files.map(quote).join(' ')}`,
};
