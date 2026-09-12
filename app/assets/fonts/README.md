# Material Symbols Rounded

These two static fonts are small subsets of Google's Material Symbols Rounded,
used by `src/components/icons.tsx`. The full variable font is not bundled.

- Source: [Google material-design-icons](https://github.com/google/material-design-icons/tree/master/variablefont)
- Downloaded 2026-09-12: `MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf`
- License: Apache 2.0; see `MaterialSymbols.LICENSE`.
- Regular subset: FILL 0, weight 400, optical size 24, grade 0; the 26 codepoints
  listed in `src/components/icons.tsx`.
- Selected navigation subset: FILL 1, weight 500, optical size 24, grade 0;
  home, south_west, north_east, notifications and settings.

To regenerate, download the upstream font and `.codepoints` file, resolve the
icon names to codepoints, then use FontTools 4.61 or later. Instantiate the
variable font with `fontTools.varLib.instancer.instantiateVariableFont` at the
axes above, subset with `fontTools.subset.Subsetter.populate(unicodes=...)`,
and save the corresponding TTF. Fonts load locally through `expo-font` in
`App.tsx`; there is no runtime download or font-generation dependency.
