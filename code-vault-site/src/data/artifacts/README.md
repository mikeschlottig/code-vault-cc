# src/data/artifacts/

This directory is populated by `npm run ingest` from your vault extractor ZIP output.

After running ingest, structure will be:
```
artifacts/
  html/
    my-artifact.meta.json
    another.meta.json
  jsx/
    component.meta.json
  py/
    script.meta.json
  ...
```

Each `.meta.json` file drives one entry in the `artifacts` content collection
and one static route at `/vault/<slug>/`.

Do NOT commit real artifact files to git — they are gitignored.
