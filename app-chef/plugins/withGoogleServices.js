const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Agrega el plugin com.google.gms:google-services a los archivos Gradle.
 * Necesario para que Firebase se inicialice nativamente en Android
 * (requerido por expo-notifications para FCM).
 */
const withGoogleServices = (config) => {
  // 1. Agregar classpath en android/build.gradle
  config = withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes('com.google.gms:google-services')) {
      config.modResults.contents = contents.replace(
        /dependencies\s*\{/,
        'dependencies {\n        classpath("com.google.gms:google-services:4.4.2")',
      );
    }
    return config;
  });

  // 2. Aplicar plugin en android/app/build.gradle
  config = withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes('com.google.gms.google-services')) {
      config.modResults.contents = contents + '\napply plugin: "com.google.gms.google-services"\n';
    }
    return config;
  });

  return config;
};

module.exports = withGoogleServices;
