const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withRealtimekitAndroid(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0];

    if (!application.service) {
      application.service = [];
    }

    const keepAliveExists = application.service.some(
      (s) =>
        s.$?.["android:name"] ===
        "com.cloudflare.realtimekit.ui.KeepAliveService"
    );

    if (!keepAliveExists) {
      application.service.push({
        $: {
          "android:enabled": "true",
          "android:foregroundServiceType": "mediaPlayback|camera|microphone",
          "android:name": "com.cloudflare.realtimekit.ui.KeepAliveService",
        },
      });
    }

    return config;
  });
};
