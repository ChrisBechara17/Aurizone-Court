module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
  web: {
    ...config.web,
    // Local web preview: "single" skips server rendering, where Supabase's
    // AsyncStorage session lookup crashes because `window` is undefined.
    output: process.env.EXPO_WEB_OUTPUT ?? config.web?.output,
  },
});
