// Dinamicki Expo config.
//
// PROD JE NETAKNUT: sve produkcijske vrednosti i dalje zive u app.json, a ovaj
// fajl ih bez izmene prosledjuje dalje. Jedini izuzetak je APP_VARIANT=development,
// kada se pravi zasebna "GameHubz Dev" aplikacija sa svojim bundle ID-em, imenom i
// ikonicom -- tako dev build i aplikacija sa App Store-a mogu da stoje jedna pored
// druge na istom telefonu, bez ikakvog dodirivanja produkcije.
//
// Dev server:  npm run start:dev
// Dev build:   eas build --profile development --platform ios
//              (APP_VARIANT je podesen u eas.json, na development profilu)

const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  if (!IS_DEV) return config;

  // Universal linkovi (share.codespheresolutions.dev) su vezani za produkcijski
  // app ID u AASA fajlu, pa se za .dev bundle nikad ne bi verifikovali -- a na
  // Androidu bi se dva paketa otimala o isti host. U dev varijanti deep linkovi
  // idu kroz gamehubzdev:// shemu.
  const { associatedDomains, googleServicesFile, ...iosRest } = config.ios ?? {};
  const {
    intentFilters,
    googleServicesFile: androidGoogleServices,
    ...androidRest
  } = config.android ?? {};

  // google-services fajlovi su vezani za produkcijski package name; Android build
  // sa .dev paketom bi pukao na "No matching client found". Nista u src/ ne uvozi
  // Firebase, a iOS push i dalje radi jer APNs kljuc vazi na nivou celog tima.

  return {
    ...config,
    name: 'GameHubz Dev',
    icon: './assets/icon-dev.png',
    scheme: 'gamehubzdev',
    ios: {
      ...iosRest,
      bundleIdentifier: `${config.ios.bundleIdentifier}.dev`,
    },
    android: {
      ...androidRest,
      package: `${config.android.package}.dev`,
      adaptiveIcon: {
        ...config.android.adaptiveIcon,
        foregroundImage: './assets/adaptive-icon-dev.png',
      },
    },
  };
};
