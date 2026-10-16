# Official Mavrixfy icon assets

`mavrixfy-mark.svg` is the editable vector master. Its ten bars, spacing, heights and colours were measured from the existing official app icon. Smooth vector edges replace the raster edge noise; this is a vector reconstruction, not a pixel-identical copy of the old PNG.

Run `npm run icons:generate` to render every asset directly from this master using Sharp (development dependency only).

- `../images/mavrixfy_icon.svg`: scalable icon with the original black background.
- `../images/mavrixfy_icon.png`: 1024 × 1024 sRGB RGB PNG, opaque and without baked-in rounded corners; used by Expo and iOS.
- `../images/mavrixfy_icon_foreground.{svg,png}`: transparent Android foreground with the existing visual footprint, inside the central 66/108 safe-zone circle.
- `../images/mavrixfy_icon_monochrome.{svg,png}`: matching white alpha silhouette for Android themed icons.
- `mavrixfy-icon-4096.png`: opaque 4096 × 4096 export for high-resolution use.
- `mavrixfy-play-store-512.png`: 512 × 512 RGBA PNG for the Play Store listing.
- `mavrixfy.ico`: multi-size Windows/browser icon (16, 24, 32, 48, 64, 128 and 256 px).

The generator also updates the checked-in Android launcher WebP resources at every existing density, using lossless compression. It preserves Android's configured `#10141A` background. The transparent `../images/mavrixfy_splash.png` and `mavrixfy-bars.json` geometry/gradients come from the same vector master. Native day/night splash resources use `../images/mavrixfy_launch_background.png`, a fully transparent image over the configured background, so an isolated stroke cannot flash or remain visible before JavaScript starts.

The app configuration already references the PNG paths. Launcher icon changes require a new native app build and installation; a JavaScript reload or OTA update cannot replace the installed icon. The SVG is a reusable design asset; it is not an Apple Icon Composer `.icon` bundle.

Launch motion uses Expo's native splash retention and Reanimated in a 224-point image box. A single UI-thread clock drives all ten SVG bars; every bar starts invisible. The reveal starts as soon as the overlay lays out, while fonts and authentication load in parallel. Each bar rises 14 points and grows into its original place, staggered left to right by 36ms, with a restrained 2% height overshoot. The completed logo stays visible until fonts, authentication, routing and the navigation layout are ready. The UI thread then starts the exit fade directly, without a JavaScript completion callback or artificial settle pause. Fast startup uses a 664ms reveal and 180ms fade (844ms total); slower startup only extends the completed-logo phase. Timing lives in `launch-motion.json`. Reduce Motion skips the reveal and uses a 120ms fade. SVG layers are memoized and cached during transforms. The animation never loops or waits for an advertisement; launch ads are scheduled after the overlay finishes. Test the handoff in a release build because Expo Go and development clients have their own splash behavior.

`npm run icons:preview` creates `mavrixfy-launch-preview.gif` from the same geometry, timings and easing. This isolated 390 × 844 preview repeats for easy review and fades onto an empty app-colour background; it does not show the real app beneath it. The GIF is not bundled or played by the app.

Platform references: [Expo app icons](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/), [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive), [Apple app icons](https://developer.apple.com/design/human-interface-guidelines/app-icons/).
