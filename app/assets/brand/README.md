# App mark

`ledger-mark.svg` is the editable source for the launcher, favicon and splash assets. The mark uses a ledger and opposing arrows to represent lending and borrowing, with the app's Material blue (`#445E91`) on a tonal blue background (`#D9E2FF`). It contains no text, demo data or Expo template artwork.

Run from `app/` with Node and ImageMagick 7 installed:

```sh
node scripts/render-brand-assets.cjs
```

PNG outputs are committed, so building the app does not require ImageMagick. The app icon has an opaque square background; Android applies its own launcher mask. The adaptive foreground and monochrome layers are transparent and share a 108-unit canvas. The mark occupies the central 52 × 60 units, within Android's 66 × 66 safe area. The monochrome layer uses transparent cutouts so launcher theme colors can supply both ink and paper.

The splash image is transparent. Configure its background and size through the `expo-splash-screen` plugin when used.

Design references: [Expo app icons and splash screens](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/), [Android adaptive icon geometry](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
