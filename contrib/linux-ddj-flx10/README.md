# Linux kernel quirk for the DDJ-FLX10 (draft, not submitted)

`0001-ALSA-usb-audio-Add-boot-quirk-for-Pioneer-DJ-DDJ-FLX.patch` adds a
boot quirk to `sound/usb/quirks.c` that sends the FLX10's seven controller
settings when the device is probed, so its audio works without
`res/controllers/flx10-autounlock/flx10_setup.py`.

Status: written against torvalds/linux master (October 2026), not compiled,
not tested on hardware. Before submitting to linux-sound@vger.kernel.org:

1. Build a kernel with it (or the `snd-usb-audio` module out of tree) and
   check `aplay -l` / `/proc/asound/card*/stream0` with the FLX10.
2. Check that the jog screens still accept data afterwards (the settings
   must not be undone by the driver's later interface setup).
3. Add a `Signed-off-by:` line (Developer Certificate of Origin) and send
   with `git send-email`, CC the ALSA maintainers listed by
   `scripts/get_maintainer.pl`.

Settings can still be changed afterwards from user space with
`flx10_setup.py settings`; the quirk only applies rekordbox's defaults.
