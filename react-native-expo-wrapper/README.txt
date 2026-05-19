Expo wrapper scaffold.

This is NOT the recommended delivery path for the Namibia app because:
- iOS cannot be installed by simply emailing an app file to a partner unless you use TestFlight, App Store, enterprise, or device-specific ad hoc signing.
- Android APK sideloading is possible, but iOS is the blocker.

Recommended: deploy the PWA folder to GitHub Pages and add it to Home Screen.

If you still want a native wrapper later, create a new Expo project and use a WebView pointed at your GitHub Pages PWA URL.
