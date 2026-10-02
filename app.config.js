// Dinamicki Expo config.
//
// Native vrednosti zive u app.json. OTA reviziju dodajemo samo u extra, bez
// promene version/runtimeVersion. APP_VARIANT=development pravi zasebnu
// "GameHubz Dev" aplikaciju sa svojim bundle ID-em, imenom i
// ikonicom -- tako dev build i aplikacija sa App Store-a mogu da stoje jedna pored
// druge na istom telefonu, bez ikakvog dodirivanja produkcije.
//
// Dev server:  npm run start:dev
// Dev build:   eas build --profile development --platform ios
//              (APP_VARIANT je podesen u eas.json, na development profilu)

const IS_DEV = process.env.APP_VARIANT === 'development';
const { readFileSync } = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const revisions = JSON.parse(readFileSync(path.join(__dirname, 'ota-revisions.json'), 'utf8'));
  const revision = revisions[config.version] ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('Invalid OTA revision in ota-revisions.json');
  }
  config = {
    ...config,
    extra: {
      ...config.extra,
      otaRelease: { baseVersion: config.version, revision },
    },
  };
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
