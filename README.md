# Prime Overlay

A GNOME Shell 50 extension that parks a sci-fi system monitor on the edge of the desktop. Clock, CPU, memory, disk, and network are drawn as Cairo dials. Process and connection lists tuck into trays under the cards, and a small pill in the top bar shows the numbers you actually glance at.

This used to be a Conky config. The old `.conkyrc` and Lua dashboard are still in [`legacy/`](legacy/). The extension keeps that look and reads `/proc` (and NetworkManager, for the local address) from inside the Shell, so it runs on Wayland and on atomic desktops like Silverblue, Bazzite, and Kinoite without layering Conky onto the host.

[![GNOME 50](https://img.shields.io/badge/GNOME-50-blue.svg)](https://extensions.gnome.org)

GPL-3. See [LICENSE](LICENSE).

---

## Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <img src="screen-shots/dock-right-full.png" width="320" alt="Right-edge dock with trays open"><br>
      Right edge, trays open
    </td>
    <td width="50%" align="center">
      <img src="screen-shots/dock-left-full.png" width="320" alt="Left-edge dock with the customizer"><br>
      Left edge, customizer open
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="screen-shots/dock-floating-trays.png" width="320" alt="Floating Island with process and connection trays open"><br>
      Floating Island, trays open
    </td>
    <td width="50%" align="center">
      <img src="screen-shots/dock-floating.png" width="320" alt="Floating Island with trays collapsed"><br>
      Floating Island, trays collapsed
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="screen-shots/customizer-right.png" width="320" alt="Dock customizer on the right edge"><br>
      Customizer, full edge
    </td>
    <td width="50%" align="center">
      <img src="screen-shots/customizer-floating.png" width="320" alt="Floating Island while a card is being reordered"><br>
      Customizer, card drag
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="screen-shots/topbar-pill.png" width="320" alt="Top-bar telemetry pill"><br>
      Top-bar pill
    </td>
    <td width="50%" align="center">
      <img src="screen-shots/topbar-menu.png" width="320" alt="Top-bar telemetry menu"><br>
      Top-bar menu
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%" align="center">
      <img src="screen-shots/prefs-dock.png" width="220" alt="Dock preferences"><br>
      Dock
    </td>
    <td width="33%" align="center">
      <img src="screen-shots/prefs-aesthetics.png" width="220" alt="Aesthetics preferences"><br>
      Aesthetics
    </td>
    <td width="33%" align="center">
      <img src="screen-shots/prefs-topbar.png" width="220" alt="Top-bar preferences"><br>
      Top bar
    </td>
  </tr>
</table>

---

## What you get

The dock sticks to the right, left, top, or bottom of a monitor. **Full Edge** runs the length of that edge and reserves the space, so maximized windows stop short of it. **Floating Island** is a shorter stack, aligned to the start, center, or end. `<Super>c` hides the dock and gives the edge back. `<Shift><Super>e` opens a customizer on the desktop: drag cards into a new order, pick the edge and the span, and turn modules on or off without opening the preferences window.

The cards are:

- **Clock.** Rings for hours, minutes, and seconds, an analog face, or a digital readout, plus uptime.
- **CPU.** Package load, frequency, temperature, and a sparkline per thread.
- **Memory.** Used and total, and swap.
- **Disk.** `/` and home (`/var/home` or `/home`). On atomic systems where `/` is a tiny composefs, the writable home filesystem is shown instead.
- **Network.** Upload and download, the interface that owns the default route, and the local address from NetworkManager. If NetworkManager is not there, the address comes from `/proc/net/fib_trie`.

Two trays sit under the cards. **Top processes** is the busy stuff from `/proc`. Click a row to raise that app, or to open System Monitor when it is installed. **Connections** lists established and listening TCP sockets from `/proc/net/tcp` and `/proc/net/tcp6`, with a process name when the socket inode can be matched. Sampling for those lists runs while a tray is open, and while a horizontal dock is showing its collapsed summary.

The top-bar pill is optional. It can show CPU, RAM, temperature, and network speeds, and it shifts to the alert color when CPU or RAM crosses the threshold you set. Its menu opens the customizer and the preferences window.

Preferences are a normal Libadwaita window: which monitor and edge, thickness, margin, corner radius, opacity, scale, and a theme (cyan, white, amber, or green). The clock can be rings, an analog dial, or digital. Core stats poll every 1 to 10 seconds. Module order and visibility live on their own page.

---

## Install

You need GNOME Shell 50. From a clone of this repo (the path below assumes `~/src/conky-prime`):

```bash
mkdir -p ~/.local/share/gnome-shell/extensions
ln -sfn ~/src/conky-prime ~/.local/share/gnome-shell/extensions/prime-overlay@autumn
glib-compile-schemas schemas/
```

Then start a fresh Shell. On Wayland that means logging out and back in. On X11, Alt+F2 and `r` is enough. Turning the extension off and on again reuses the JavaScript already loaded in that Shell, so it will not pick up edits until you restart.

```bash
gnome-extensions enable prime-overlay@autumn
```

Open preferences from the Extensions app, the top-bar menu, or `gnome-extensions prefs prime-overlay@autumn`.

The `/proc` parsers can be checked on their own, without loading the Shell UI:

```bash
gjs -m tests/test-engines.js
```

---

## Layout

`extension.js` enables and disables the extension. Preferences live in `prefs.js` and the Libadwaita pages under `prefs/`. The Shell side is `src/`: `app.js` wires things together, `dock/` places the dock and handles dragging, `dials/` is the widgets, `metrics/` polls, and `engine/` is the `/proc` and D-Bus readers. `engine/` stays free of Shell and GTK imports so `tests/test-engines.js` can run it under plain `gjs`.

Settings use the schema `org.gnome.shell.extensions.prime-overlay` (`schemas/`, also named in `metadata.json`). The UUID is `prime-overlay@autumn`.

```plaintext
conky-prime/
├── legacy/              # the old Conky config and Lua dashboard
├── extension.js
├── prefs.js
├── prefs/
├── src/
│   ├── app.js
│   ├── common/
│   ├── dock/
│   ├── metrics/
│   ├── dials/
│   └── engine/
├── screen-shots/
├── tests/
├── schemas/
├── stylesheet.css
├── metadata.json
├── LICENSE
└── README.md
```
