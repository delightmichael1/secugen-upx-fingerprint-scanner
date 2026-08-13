# secugen-upx-fingerprint-scanner

Framework-agnostic WebUSB driver + decoder for the **SecuGen UPx-family** fingerprint
scanners:

- **HUPx** — Hamster Pro (`VID 0x1162` / PID `0x2201`, "UPx class"), 260×300 @ 500 DPI
- **UPx-AP** — Hamster Pro V2 (`VID 0x1162` / PID `0x2310`), 1400×1000 @ 500 DPI

The connected product is **auto-detected** from its USB product id, so the same call
captures + decodes at the correct frame size for whichever device is plugged in.

The capture sequence, exposure/gain register tuning and frame decode were reverse-engineered
from the vendor demo application and validated on real hardware:

- The LED is visibly lit during capture
- A full-contrast image is decoded from the quincunx-sampled frame

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
// UPx-AP, 260×300 for HUPx).
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
| `requestType` / `recipient`                       | `"class"` / `"interface"`                          | bmRequestType for all control transfers                                                                                                                                                  |
| `request`                                         | `0x01`                                             | bRequest for all control transfers                                                                                                                                                       |
| `controlIndex`                                    | `0x0600`                                           | wIndex used on every control transfer                                                                                                                                                    |
| `commandWindow` / `registerWindow` / `initWindow` | `0x0600` / `0x0700` / `0x1800`                     | wValue (window) per command type                                                                                                                                                         |
| `initBlock`                                       | 516-byte captured block                            | Sensor init payload (hex string or `Uint8Array`)                                                                                                                                         |
| `setupCommand`                                    | `810b780400000000100100`                           | Streaming setup command                                                                                                                                                                  |
| `captureCommand`                                  | `810b780300000000000000`                           | Capture command                                                                                                                                                                          |
| `ledBrightnessCommand`                            | `010b8f4000060b00c01909`                           | LED brightness command                                                                                                                                                                   |
| `ledOnCommand` / `ledOffCommand`                  | `810b8e010…` / `810b8e000…`                        | LED on/off commands                                                                                                                                                                      |
| `registerWriteTemplate`                           | `8100RRVV00060b00000000`                           | Register-write payload; bytes 2–3 = reg/value                                                                                                                                            |
| `exposureRegisters`                               | `[fe00, 0900, 0a80, 0b00, 0c80, fe00, 0301, 04a7]` | Exposure/gain register writes (`[reg, val][]`)                                                                                                                                           |
| `warmupCapture`                                   | `true`                                             | Run + drain a warmup capture first                                                                                                                                                       |
| `ledHoldMs`                                       | `700`                                              | LED-on → capture delay (ms)                                                                                                                                                              |
| `captureTimeoutMs`                                | `45000`                                            | Whole-capture timeout                                                                                                                                                                    |
| `expectedFrameBytes`                              | `1,400,012` (UPx-AP) / `78,012` (HUPx)             | Raw frame size the bulk reader waits for (auto-selects by product)                                                                                                                       |

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

All parameters of the decoder pipeline are configurable:

1. **quincunx placement** — samples land on `(x+y) odd` cells,
2. **fill** — empty even cells averaged from orthogonal neighbours (`"orthogonal-mean"` or `"none"`),
3. **invert** — polarity (`true` = dark ridges on light, the demo look),
4. **rotate** — `0` | `180` (sensor reads bottom-up),
5. **gamma** — adaptive brightness normalisation (see below).

| Option             | Default                               | Meaning                                            |
| ------------------ | ------------------------------------- | -------------------------------------------------- |
| `headerBytes`      | `12`                                  | Bytes to strip from the front of the frame         |
| `width` / `height` | product geometry                      | Output dimensions (1400/1000 UPx-AP, 260/300 HUPx) |
| `fill`             | `"orthogonal-mean"`                   | Interpolation of empty quincunx cells              |
| `invert`           | `true`                                | Polarity                                           |
| `rotate`           | `180`                                 | Orientation                                        |
| `gamma`            | `{ target: 200, min: 0.5, max: 2.2 }` | Adaptive brightness; `null` disables               |

The adaptive gamma pass computes the median of the decoded, inverted frame and applies a
gamma such that the median lands on `target`. This keeps flat or over-bright captures
looking contrasty, while already-good captures pass through at `γ ≈ 1`. Disable with
`gamma: null` or tune the target/clamps to taste.

## Frame layout

Each raw frame is `12` header bytes + `width × height` sample bytes (`1400×1000` for UPx-AP,
`260×300` for HUPx). Samples live at cells where `(x + y)` is odd; the even cells are zeros
that the decoder fills. The sensor array is read bottom-up, so decoding rotates 180° and
inverts to match the vendor demo look. All of this is overridable via `DecodeOptions`.

## Notes

- Control transfers use bmRequestType `0x21` (class/interface). The device stalls on
  `0x40` (vendor/device), which is why the LED never lit in earlier attempts.
- The warmup frame may be truncated; `captureBulk` drains it by retrying.
- Only Chrome/Edge (desktop) expose `navigator.usb`.
- **Linux permission**: without the udev rules above, `open()` fails with
  `SecurityError: Access denied` (see the Linux section). Windows/macOS work without setup.
