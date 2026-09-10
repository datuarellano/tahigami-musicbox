# Firmware releases

Files here are served verbatim at `/tahigami-musicbox/firmware/` (same origin as
the updater page, so no CORS).

## Cutting a release

1. In the `D1-40` repo, on a clean checkout at the release tag:
   `~/.platformio/penv/bin/pio run -e teensy40-release`
   (this env fails the build unless `FW_VERSION` in `include/version.h` matches
   the git tag).
2. Copy `.pio/build/teensy40-release/firmware.hex` here as
   `d1-40-<version>.hex`.
3. `shasum -a 256 d1-40-<version>.hex` — put the hex digest in `manifest.json`
   as the release's `sha256` (the updater refuses to flash on a mismatch).
4. Set `date`, `notes`, bump `latest`, keep older entries in `releases`.
5. `pnpm run deploy`.

`proto` must match the firmware's `FW_PROTO` — the updater uses it to decide
whether the device understands `!BOOTLOADER` or needs the 134-baud poke.
