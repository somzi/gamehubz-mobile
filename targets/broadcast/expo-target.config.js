// Broadcast Upload extension: captures the screen while the player is in the game and sends it to
// their linked Twitch / Kick channel (see SampleHandler.swift). Shares an App Group with the app,
// which is how the session config goes in and the live status comes back out.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'broadcast-upload',
  name: 'broadcast',
  displayName: 'GameHubz',
  // The app finds the extension by this id (GameHubzBroadcastModule.extensionBundleId).
  bundleIdentifier: '.broadcast',
  deploymentTarget: '15.1',
  frameworks: ['ReplayKit', 'VideoToolbox', 'CoreImage'],
  entitlements: {
    'com.apple.security.application-groups': [`group.${config.ios.bundleIdentifier}`],
  },
});
