// Personalize your home screen here, then rebuild with ./install_home.sh
window.HOME_SETTINGS = {
  // Shown in the greeting: "Good evening, <name>". Leave empty for just "Good evening".
  ownerName: '',

  use24HourClock: false,

  weather: {
    city: 'Dhaka',
    latitude: 23.8103,
    longitude: 90.4125,
    unit: 'celsius' // or 'fahrenheit'
  },

  // Tizen app ID of the IPTV app (see samsung-tv-iptv/config.xml)
  iptvAppId: 'AE6BDAA214.iptv',
  // Used instead of the IPTV app when previewing in a desktop browser
  iptvBrowserUrl: '../samsung-tv-iptv/',

  // First-run "My Apps" row: exact Tizen app IDs or part of an app's name.
  // After you pin/unpin with the RED button, your own choice is remembered instead.
  defaultPinnedApps: ['AE6BDAA214.iptv', 'YouTube', 'Netflix', 'Prime Video', 'Disney', 'Spotify', 'Internet'],

  // Only used for the desktop-browser preview (on the TV the real installed apps are listed)
  previewApps: [
    { id: 'AE6BDAA214.iptv', name: 'Samsung Smart IPTV', icon: '../samsung-tv-iptv/icon.png' },
    { id: 'preview.youtube', name: 'YouTube' },
    { id: 'preview.netflix', name: 'Netflix' },
    { id: 'preview.prime', name: 'Prime Video' },
    { id: 'preview.spotify', name: 'Spotify' },
    { id: 'preview.browser', name: 'Internet' },
    { id: 'preview.gallery', name: 'Gallery' },
    { id: 'preview.settings', name: 'Settings' }
  ]
};
