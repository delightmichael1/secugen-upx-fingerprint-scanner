# secugen-upx-fingerprint-scanner

Framework-agnostic WebUSB driver + decoder for the **SecuGen UPx-family** fingerprint
scanners:

- **HUPx** — Hamster Pro (`VID 0x1162` / PID `0x2201`, "UPx class"), 552×356 @ 500 DPI
- **UPx-AP** — Hamster Pro V2 (`VID 0x1162` / PID `0x2310`), 1400×1000 @ 500 DPI

The connected product is **auto-detected** from its USB product id, so the same call
captures + decodes at the correct frame size for whichever device is plugged in.

The capture sequence, exposure/gain register tuning and frame decode were reverse-engineered
from the vendor demo application and validated on real hardware:

- The LED is visibly lit during capture
- A full-contrast image is decoded from the raw frame (quincunx-sampled on UPx-AP,
  plain row-major 8-bit on HUPx)
- The HUPx capture runs through its register protocol (`bRequest 0x22` / `wValue 0x0033`
  with read-back verify) mirroring the vendor demo's per-scan control sequence: a short-exposure
  **calibrate pass** (frame discarded) followed by the long-exposure **real pass** with the
  platen **LED gated on** via `cmd11` (`wVal 0x0001` → on, `0x0000` → off) around `TRIG` /
  status poll / `cmd01` / `bulk` / `cmd02`. The bulk read requests exactly the 196,608-byte
  frame (the device streams continuously and does not end with a short packet).

## Install

```bash
npm install secugen-upx-fingerprint-scanner
# or from a local checkout
npm install file:../packages/secugen-upx-fingerprint-scanner
```

Works in any WebUSB-capable browser (Chrome / Edge on desktop). It is a pure TypeScript
library — no framework, no WebUSB types bundled, no Node dependency.

## Linux: udev access (required once per machine)

On Linux, Chrome needs permission to open `/dev/bus/usb/*` for the scanner, otherwise
`open()` throws `SecurityError: Failed to execute 'open' on 'USBDevice': Access denied`.

A ready-made rule ships in this package at `udev/60-secugen.rules` (covers HUPx `0x2201`
and UPx-AP `0x2310`):

```bash
sudo cp node_modules/secugen-upx-fingerprint-scanner/udev/60-secugen.rules /etc/udev/rules.d/
sudo udevadm control --reload
sudo udevadm trigger
# then unplug + replug the scanner (a plain browser reload is not enough)
```

Windows and macOS need no setup.

## Quick start

```ts
import {
  isWebUsbSupported,
  getGrantedScannerDevice,
  requestScannerDevice,
  openScanner,
  scanAndDecode,
  closeScanner,
} from "secugen-upx-fingerprint-scanner";

if (!isWebUsbSupported()) throw new Error("WebUSB required");

let device =
  (await getGrantedScannerDevice()) ?? (await requestScannerDevice()); // prompts once
await openScanner(device);

// Capture + decode in one call. Auto-detects HUPx or UPx-AP geometry.
const image = await scanAndDecode(device);

// The decoded pixels are width×height bytes of grayscale (1400×1000 for
// UPx-AP, 640×307 for HUPx).
const canvas = document.querySelector("canvas");
canvas.width = image.width;
canvas.height = image.height;
const ctx = canvas.getContext("2d")!;
const img = ctx.createImageData(image.width, image.height);
for (let i = 0; i < image.raw.length; i++) {
  img.data[i * 4] = image.raw[i];
  img.data[i * 4 + 1] = image.raw[i];
  img.data[i * 4 + 2] = image.raw[i];
  img.data[i * 4 + 3] = 255;
}
ctx.putImageData(img, 0, 0);

await closeScanner(device);
```

Call `scanAndDecode(device)` repeatedly — each call re-arms the sensor and returns a fresh
decoded frame.

### Class API

```ts
import { SecuGenScanner } from "secugen-upx-fingerprint-scanner";

const scanner = new SecuGenScanner(device, options);
await scanner.open();
const rawFrame = await scanner.capture(); // Uint8Array (product geometry)
const decoded = await scanner.scan(decodeOpts); // DecodedFingerprint
await scanner.close();
console.log(scanner.productInfo.name); // "HUPx" | "UPx-AP"
```

### Free functions

| Function                                         | Purpose                                                  |
| ------------------------------------------------ | -------------------------------------------------------- |
| `isWebUsbSupported()`                            | Checks `navigator.usb` exists                            |
| `requestScannerDevice(options?)`                 | Opens the browser device chooser                         |
| `getGrantedScannerDevice(options?)`              | Reconnects a previously granted device without prompting |
| `openScanner(device, options?)`                  | Opens + claims the interface                             |
| `captureBulk(device, expectedLength?, options?)` | Low-level bulk-IN read                                   |
| `scanFingerprint(device, options?)`              | Raw capture (header + pixels)                            |
| `scanAndDecode(device, scanOpts?, decodeOpts?)`  | Capture + decode                                         |
| `closeScanner(device)`                           | Releases the interface + closes                          |
| `createScanner(device, options?)`                | Factory for a configured class                           |
| `resolveScannerOptions(options?)`                | Merges options onto the verified defaults                |
| `detectProduct(device, options?)`                | Resolves the connected product profile (HUPx / UPx-AP)   |
| `getScannerProduct(productId?)`                  | Product profile lookup; defaults to UPx-AP               |

## Configuration

Everything the driver uses is overridable via `ScannerOptions`. Defaults are the values
reverse-engineered from the vendor demo app. Only supply what you want to change.

### `ScannerOptions`

| Option                                            | Default                                            | Meaning                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendorId` / `productId`                          | `0x1162` / `0x2310`                                | Device matching (chooser + granted lookup). `productId` also selects the product's default geometry — pass `0x2201` for HUPx, `0x2310` for UPx-AP; omitted = auto-detect from the device |
| `interfaceNumber`                                 | `0`                                                | USB interface to claim                                                                                                                                                                   |
| `configurationValue`                              | `1`                                                | Configuration to select                                                                                                                                                                  |
| `bulkEndpoint`                                    | `2` (`0x82`)                                       | Bulk-IN endpoint that streams frames                                                                                                                                                     |
| `requestType` / `recipient`                       | `"class"` / `"interface"`                          | bmRequestType for all control transfers (HUPx register protocol uses `0x40`/`0xc0` vendor/device)                                                              |
| `request`                                         | `0x01`                                             | bRequest for all control transfers                                                                                                                                                       |
| `controlIndex`                                    | `0x0600`                                           | wIndex used on every control transfer                                                                                                                                                    |
| `commandWindow` / `registerWindow` / `initWindow` | `0x0600` / `0x0700` / `0x1800`                     | wValue (window) per command type (class-command protocol only)                                                                                                                           |
| `initBlock`                                       | 516-byte captured block                            | Sensor init payload (hex string or `Uint8Array`)                                                                                                                                         |
| `setupCommand`                                    | `810b780400000000100100`                           | Streaming setup command                                                                                                                                                                  |
| `captureCommand`                                  | `810b780300000000000000`                           | Capture command                                                                                                                                                                          |
| `ledBrightnessCommand`                            | `010b8f4000060b00c01909`                           | LED brightness command                                                                                                                                                                   |
| `ledOnCommand` / `ledOffCommand`                  | `810b8e010…` / `810b8e000…`                        | LED on/off commands                                                                                                                                                                      |
| `registerWriteTemplate`                           | `8100RRVV00060b00000000`                           | Register-write payload; bytes 2–3 = reg/value                                                                                                                                            |
| `exposureRegisters`                               | product default                                   | Exposure/gain register writes (`[reg, val][]`). HUPx: long-exposure profile `[f0 24, f1 30, f2 28, f3 24, f4 66]`; UPx-AP: `[fe00, 0900, 0a80, 0b00, 0c80, fe00, 0301, 04a7]` |
| `warmupCapture`                                   | `true` (class-command) / `false` (register)        | Run + drain a warmup capture first (register protocol always runs its internal calibrate pass per scan)                                                                                  |
| `ledHoldMs`                                       | `700`                                              | LED-on → capture delay (ms)                                                                                                                                                              |
| `captureTimeoutMs`                                | `45000`                                            | Whole-capture timeout                                                                                                                                                                    |
| `expectedFrameBytes`                              | `1,400,012` (UPx-AP) / `196,608` (HUPx)            | Exact raw frame size the bulk reader requests (auto-selects by product)                                                                                                                  |
| `register.*`                                      | HUPx envelope                                      | Register-protocol control values: `request` `0x22`, `value` `0x0033`, `verify` `true`, `triggerRequest` `0x05` / `triggerValue` `0x0001`, `statusRequest` `0x08` / `statusIndex` `0x2000` / `statusLength` `10`, `cmd01Request` `0x01`, `cmd02Request` `0x02`, `cmd11Request` `0x11` / `ledOnValue` `0x0001` / `ledOffValue` `0x0000`, `statusPollRequest` `0x16` / `statusPollLength` `4`, `initRegisters` (~150 captured regs), `calibrateGainRegisters` `[30 01, 31 2c]`, `captureGainRegisters` `[30 02, 31 58]` |

#### Tuning examples

```ts
// Higher gain + longer exposure for darker skin / less pressure.
await scanAndDecode(device, {
  exposureRegisters: [
    [0xfe, 0x00],
    [0x09, 0x00],
    [0x0a, 0xc0],
    [0x0b, 0x00],
    [0x0c, 0xa0],
    [0xfe, 0x00],
    [0x03, 0x01],
    [0x04, 0xc0],
  ],
});

// Disable the warmup pass (faster, marginally noisier frames).
await scanAndDecode(device, { warmupCapture: false });
```

### `DecodeOptions`

All parameters of the decoder pipeline are configurable. The pipeline is
product-aware: UPx-AP frames are **quincunx-sampled** (samples land on
`(x+y) odd` cells, the even cells are zeros the decoder fills), while HUPx
frames are **plain row-major 8-bit** pixels with no sampling gaps:

1. **sampling** — `"quincunx"` (UPx-AP) or `"plain"` (HUPx),
2. **fill** — empty quincunx cells averaged from orthogonal neighbours (`"orthogonal-mean"` or `"none"`),
3. **invert** — polarity (`true` = dark ridges on light, the demo look),
4. **rotate** — `0` | `180` (sensor reads bottom-up),
5. **gamma** — adaptive brightness normalisation (see below).

| Option             | Default                               | Meaning                                            |
| ------------------ | ------------------------------------- | -------------------------------------------------- |
| `sampling`         | product default                       | `"quincunx"` (UPx-AP) or `"plain"` (HUPx)          |
| `headerBytes`      | product default                       | Bytes to strip from the front of the frame (12 UPx-AP, 0 HUPx) |
| `width` / `height` | product geometry                      | Output dimensions (1400/1000 UPx-AP, 640/307 HUPx) |
| `fill`             | `"orthogonal-mean"`                   | Interpolation of empty quincunx cells              |
| `invert`           | `true`                                | Polarity                                           |
| `rotate`           | `180`                                 | Orientation                                        |
| `gamma`            | `{ target: 200, min: 0.5, max: 2.2 }` | Adaptive brightness; `null` disables               |

The adaptive gamma pass computes the median of the decoded, inverted frame and applies a
gamma such that the median lands on `target`. This keeps flat or over-bright captures
looking contrasty, while already-good captures pass through at `γ ≈ 1`. Disable with
`gamma: null` or tune the target/clamps to taste.

## Frame layout

Raw frame layouts are product-specific:

- **UPx-AP**: `12` header bytes + `1400 × 1000` quincunx-sampled sample bytes
  (`1,400,012` bytes total). Samples live at cells where `(x + y)` is odd; the
  even cells are zeros that the decoder fills.
- **HUPx**: `552 × 356` plain row-major 8-bit pixels + `96` trailing padding
  bytes (`196,608` bytes total, no header). The decoder copies rows straight
  through and drops the trailing padding. (Geometry re-derived from a live
  LED-on capture: adjacent-row correlation peaks at a 552-byte row pitch vs
  ~0.015 at the previously-assumed 640, which scrambled every row by 88px.)

The sensor array is read bottom-up, so decoding rotates 180° and inverts to match
the vendor demo look. All of this is overridable via `DecodeOptions`.

## Notes

- Control transfers use bmRequestType `0x21` (class/interface) for the UPx-AP
  class-command flow. The HUPx register protocol instead uses vendor/device
  `0x40` (OUT) / `0xc0` (IN) envelopes: `bRequest 0x22`, `wValue 0x0033`,
  `wIndex = register`, one-byte write followed by a read-back verify.
- The HUPx capture mirrors the vendor demo's per-scan two-pass sequence:
  **pass 1 (calibrate, discarded)** — `TRIG` → status poll (bReq 8, wIdx 0x2000)
  → short-exposure calibrate gain (`R48/R49 = 0x01/0x2c`) → `TRIG` → `cmd01`
  (bReq 1) → bulk frame read (discarded) → `cmd02` (bReq 2). Then **pass 2
  (real capture)** — long-exposure registers (R240-244 = `0xf0`–`0xf4` =
  `0x24 0x30 0x28 0x24 0x66`) → `TRIG` → long gain (`R48/R49 = 0x02/0x58`) →
  image-ready status poll (bReq `0x16`, wLen 4) ×2 → `cmd11` LED ON (`wVal
  0x0001`) → long gain again → `TRIG` → `cmd01` → bulk frame read (the frame)
  → `cmd02` → status poll → `cmd11` LED OFF (`wVal 0x0000`). Without the `cmd11`
  LED gate the platen LED never lights, and the first pass provides the
  short-exposure frame the sensor needs before the long-exposure capture is sharp.
- The HUPx bulk reader requests **exactly** the 196,608-byte frame — the device
  streams continuously and does not end the frame with a short packet, so the
  old "read up to 1 MiB" over-read past the frame and misaligned the image.
- The warmup frame may be truncated; `captureBulk` drains it by retrying.
- Only Chrome/Edge (desktop) expose `navigator.usb`.
- **Linux permission**: without the udev rules above, `open()` fails with
  `SecurityError: Access denied` (see the Linux section). Windows/macOS work without setup.
