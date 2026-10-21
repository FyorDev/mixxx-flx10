#!/usr/bin/env python3
"""DDJ-FLX10 setup for Linux: controller settings and the jog screen DJ logo.

The seven "unlock" transfers are the DDJ-FLX10 Setup utility's settings
writes, so `settings` sends them with values you choose (defaults are the
values rekordbox sends at connect). `logo` uploads a 240x240 JPEG shown in
the jog screen's DJ LOGO mode; `logo --delete` removes it.

Protocol from Gino Messmer's macOS FLX10 Utility
(github.com/ginomessmer/ddj-flx10-util, MIT): ControllerSettings.swift and
LogoProtocol.swift / LogoTransferMachine.swift.

settings needs pyusb and root (or a udev rule for the device);
logo needs write access to the FLX10's /dev/hidraw node.

  sudo flx10_setup.py settings
  sudo flx10_setup.py settings --jog-ring-color 2 --time-mode elapsed
  flx10_setup.py logo mylogo.jpg
  flx10_setup.py logo --delete
"""
import argparse
import glob
import os
import select
import sys
import time

VID, PID = 0x2B73, 0x0041

# wIndex selector, choices (name -> value), rekordbox's connect value.
SETTINGS = {
    "slip-flashing": (0xC028, {"off": 0, "on": 1}, "on"),
    "slip-led": (0xC029, {"light": 0, "blink": 1}, "light"),
    "fader-start": (0xC013, {"on": 1, "off": 2}, "off"),
    "jog-ring-color": (0xC02B, {"1": 0, "2": 1, "3": 2}, "1"),
    "time-mode": (0xC026, {"elapsed": 0, "remaining": 1}, "remaining"),
    "rec-out": (0xC01D, {"with-mic": 0, "without-mic": 1}, "with-mic"),
    "virtual-deck": (0xC027, {"off": 0, "on": 1}, "on"),
}
# Same order as rekordbox and the original unlock script.
ORDER = ["slip-flashing", "slip-led", "fader-start", "jog-ring-color",
         "time-mode", "rec-out", "virtual-deck"]

REPORT = 128
FIRST_CHUNK = 119
CHUNK = 122
REQUEST, DATA, DELETE_EXECUTE = 0xD0, 0xD1, 0xD7
READY, TRANSFER_ACK, TRANSFER_NAK, DELETE_ACK, DELETE_NAK = 0xD8, 0xDC, 0xDD, 0xDE, 0xDF


def apply_settings(args):
    import usb.core
    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        sys.exit("DDJ-FLX10 not found")
    for name in ORDER:
        selector, choices, _ = SETTINGS[name]
        value = choices[getattr(args, name.replace("-", "_"))]
        dev.ctrl_transfer(0x40, 3, value << 8, selector, None)
        print(f"{name} = {getattr(args, name.replace('-', '_'))}")
        time.sleep(0.005)


def find_hidraw():
    for uevent in glob.glob("/sys/class/hidraw/hidraw*/device/uevent"):
        with open(uevent) as f:
            if f"{VID:08X}:{PID:08X}" in f.read().upper():
                return "/dev/" + uevent.split("/")[4]
    sys.exit("DDJ-FLX10 hidraw node not found")


def write_report(fd, report):
    # hidraw treats the first byte as the report id; the FLX10 has none.
    os.write(fd, bytes([0]) + bytes(report))


def wait_for(fd, wanted, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        ready, _, _ = select.select([fd], [], [], max(0.0, end - time.time()))
        if not ready:
            break
        data = os.read(fd, 64)
        if len(data) > 1 and data[1] in wanted:
            return data[1]
    sys.exit("timed out waiting for the controller")


def data_reports(payload):
    count = 1 if len(payload) <= FIRST_CHUNK else 1 + -(-(len(payload) - FIRST_CHUNK) // CHUNK)
    offset = 0
    for index in range(1, count + 1):
        r = bytearray(REPORT)
        r[1] = DATA
        r[2:4] = index.to_bytes(2, "little")
        r[4:6] = count.to_bytes(2, "little")
        if index == 1:
            r[6:9] = len(payload).to_bytes(3, "little")
            head, cap = 9, FIRST_CHUNK
        else:
            head, cap = 6, CHUNK
        part = payload[offset:offset + cap]
        r[head:head + len(part)] = part
        offset += len(part)
        yield r


def logo(args):
    fd = os.open(find_hidraw(), os.O_RDWR)
    try:
        if args.delete:
            write_report(fd, bytes([0, REQUEST]) + bytes(REPORT - 2))
            wait_for(fd, {READY})
            wait_for(fd, {READY})
            write_report(fd, bytes([0, DELETE_EXECUTE]) + bytes(REPORT - 2))
            results = [wait_for(fd, {DELETE_ACK, DELETE_NAK}) for _ in range(2)]
            ok = DELETE_NAK not in results
            print("logo deleted" if ok else "delete refused")
            return 0 if ok else 1
        payload = open(args.image, "rb").read()
        if payload[:2] != b"\xff\xd8":
            sys.exit("not a JPEG file (convert to a 240x240 JPEG first)")
        request = bytearray(REPORT)
        request[1], request[2] = REQUEST, 0x01
        request[3:6] = len(payload).to_bytes(3, "little")
        write_report(fd, request)
        wait_for(fd, {READY})
        wait_for(fd, {READY})
        for r in data_reports(payload):
            write_report(fd, r)
        results = [wait_for(fd, {TRANSFER_ACK, TRANSFER_NAK}) for _ in range(2)]
        ok = TRANSFER_NAK not in results
        print("logo uploaded" if ok else "upload refused")
        return 0 if ok else 1
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("settings", help="write controller settings (also unlocks screens/audio)")
    for name in ORDER:
        _, choices, default = SETTINGS[name]
        s.add_argument("--" + name, choices=list(choices), default=default)
    s.set_defaults(func=apply_settings)
    lg = sub.add_parser("logo", help="upload or delete the DJ logo")
    lg.add_argument("image", nargs="?", help="240x240 JPEG")
    lg.add_argument("--delete", action="store_true")
    lg.set_defaults(func=logo)
    args = parser.parse_args()
    if args.cmd == "logo" and not args.delete and not args.image:
        parser.error("logo needs an image or --delete")
    sys.exit(args.func(args) or 0)


if __name__ == "__main__":
    main()
