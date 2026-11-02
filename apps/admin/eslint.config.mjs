import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-config-next 16 ships React-Compiler-era checks (react-hooks v7).
    // The admin does not use the React Compiler and its existing effects are
    // deliberate (theme/session hydration, hard navigation after logout), so
    // the upgrade keeps behaviour as is. Migrate these off one by one.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      '@next/next/no-location-assign-relative-destination': 'off',
    },
  },
  { ignores: ['.next/**', 'src/lib/api/schema.d.ts', 'next-env.d.ts'] },
];

export default config;
