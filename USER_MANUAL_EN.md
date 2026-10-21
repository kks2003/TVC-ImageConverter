# Videoton TV Computert (TVC) Image Maker - Comprehensive User Manual (v4.3)

## Introduction
The Videoton TV Computert (TVC) Image Maker is a professional-grade tool designed to convert modern digital images into the native graphics format of the classic 8-bit Hungarian Videoton TV Computer (TVC). The tool accurately simulates the hardware limitations of the TVC, including its unique 16-color palette (note: since there are two blacks, it is effectively 15 colors) and anamorphic pixels.

## 1. Getting Started
To begin, load an image:
- Click the central **"Select Image or Drag & Drop"** area.
- Alternatively, drag and drop an image file directly into the browser window.
Once loaded, you will see a real-time preview of the image in the TVC's restricted resolution and color palette.

### 1.1. Auto-Crop Solid Border
- On the upload screen, you can enable **"Auto-crop solid border (based on top-left pixel)"**.
- When enabled, loading an image automatically inspects the top-left pixel (0,0) color and crops away any surrounding solid color border or margin from all 4 sides.
- For already loaded images, you can click the **"Trim border"** button in the Composition panel header to remove the surrounding solid border at any time with a single click.

## 2. Interface Overview

### 2.1. Color Modes
The application supports three distinct TVC graphics modes. You can switch between them using the buttons provided. The application remembers your settings for each mode, so switching back will restore your previous parameters.

*   **16 Colors:** The original 128x240 resolution mode. Pixels are stretched horizontally (2:1 aspect ratio). All 16 TVC colors (15 unique colors) are available.
*   **4 Colors:** 256x240 resolution mode. Pixels have a 1:1 aspect ratio (square). Only 4 colors from the palette can be displayed at once. The application automatically selects the best 4 colors for your image, but you can manually override them in the "Selected Colors" panel.
*   **2 Colors:** 512x240 resolution mode. Pixels have a 1:1 aspect ratio (square). Only 2 colors can be displayed at once. The application automatically selects the best 2 colors, which you can also manually override. In this mode, an "Invert Colors" button is available, which allows you to swap the two selected colors in the output image (e.g., a white image on a red background becomes a red image on a white background) without modifying the palette itself.

### 2.2. Image Size Modes
*   **Original Size:** The image remains at its original resolution, but applies the palette and dithering of the currently selected color mode. In this mode, you can choose between two saving options:
    *   **Original Size:** Saves the entire source image in its original resolution, but with TVC colors and dithering.
    *   **Composition:** Saves only the visible crop (according to zoom and pan settings) in the fixed resolution of the chosen TVC mode (e.g., 128x240).
*   **Full TVC Screen:** The image is scaled to fit the TVC's full visible screen resolution. The exact resolution depends on the graphics mode (512x240, 256x240, or 128x240), but the physical display aspect ratio is always roughly 4:3. Because the pixel aspect ratio changes depending on the mode (stretched horizontally in 16-color mode, squeezed in 2-color mode, and square in 4-color mode), the final image always fills the same 4:3 physical screen area.
*   **TVC256k++:** Special 16-color mode with 256x240 pixel resolution and 1:1 pixel aspect ratio (square pixels).

### 2.3. Composition & Positioning
The TVC screen has a physical aspect ratio of 4:3, with pixel shape and resolution depending on the selected color mode. The composition settings determine how your source image fits into this TVC screen.

*   **Display Modes:**
    *   **Crop Fill:** Fills the entire area, cropping excess parts.
    *   **Letterbox:** Shows the entire image, filling edges with the background color.
    *   **Stretch Fill:** Forces the image to the exact TVC resolution (may cause distortion).
*   **Zoom:** Adjustable between 10% and 1000%. Use the slider or mouse wheel.
*   **Positioning:** Drag the image with your mouse or use the Horizontal Pos / Vertical Pos sliders. Use the "Center" button to reset the image position.

### 2.4. Adjustments
Fine-tune your source image for better conversion.
*   **Brightness:** Adjusts overall lightness.
*   **Contrast:** Enhances the difference between light and dark areas.
*   **Saturation:** TVC colors are vibrant; you may need to reduce source saturation.
*   **Gamma:** Controls the brightness of midtones.
*   **Auto-Tune (A1 / A2 / A3):**
    *   **A1 (TVC Style):** Automatically finds the most stylistically fitting settings and dither method, favoring an authentic retro TVC look.
    *   **A2 (Fidelity Mode):** Focuses specifically on your current composition/crop and finds the parameters that mathematically and visually deviate the least from that exact part of the source image.
    *   **A3 (Clean Pixel Art):** Tuned for hand-pixelated artwork with flat color areas. Deliberately excludes noisy error-diffusion dither methods, and skips the "brighten dark images" heuristic used by A1/A2 - a deliberately dark or moody image (e.g. a night scene) should stay dark. In benchmark tests this mode gave the closest match to hand-pixelated reference images.
*   **Reset:** Resets all adjustment sliders to their default values.
*   **Copy Settings (4c / 2c etc. buttons):** Using the small buttons next to the "Image Adjustments" title, you can copy the slider settings from other color modes (e.g., 4-color or 2-color mode) into the current mode with a single click.

### 2.5. Dithering Method
Since the TVC only supports 15 colors, the program simulates gradients using dithering.
*   **Methods:**
    *   **Modernist:** Balance between detail and clean colors.
    *   **Ordered (Classic):** Regular pattern dithering, 80s style.
    *   **Diffusion (Sierra/Stucki/Jarvis):** Natural, error-diffusion based methods.
    *   **Pattern TVC:** Optimized for TVC hardware. It works by creating a checkerboard pattern alternating between two carefully selected colors from the palette. This takes advantage of the TVC's video output characteristics, blending the two colors visually on CRT screens to create the illusion of a third, intermediate color without the noise of error diffusion.
    *   **Threshold (No pattern):** No dithering, nearest color only.
    *   **Yliluoma:** Joel Yliluoma's classic algorithm, designed specifically for small/irregular palettes like the TVC's 15 colors. It generalizes the Pattern TVC idea: instead of mixing exactly 2 colors, it can combine up to 8 palette colors at a given point, using gamma-correct (linear-light) mixing for smoother gradients. *Note:* because the TVC palette has few closely-related shades, this mode can introduce colorful "confetti" noise in flat, dark areas (e.g. a night sky) compared to Pattern TVC - it's most worth trying on photographic, continuous-gradient images.

*   **Pair Blocklist (Pattern TVC / Yliluoma only):** The grid shown under "Dither Tuning" lets you individually disable which two colors are allowed to mix during pattern dithering. Clicking a cell on the grid's diagonal excludes that color *entirely* (from every pair at once); clicking again re-enables it.

*   **Dither Tuning:**
    *   **Dither Amount:** How "grainy" the image is.
    *   **Noise Level:** Adds random patterns to avoid banding.
    *   **Solid Area Snap:** Prevents dithering on solid color areas.

### 2.6. Background Fill
Select one of the 15 fixed TVC colors to fill empty areas.

### 2.7. Export Options
1. **Save as BMP:** Standard Windows BMP file with TVC palette. 
   *   *Note for 16 Colors Mode:* You can save the BMP in either **1:1** pixel ratio (128x240, raw storage format) or **2:1** pixel ratio (256x240, stretched to simulate the actual TVC display).
   *   *TVC256k++ mode:* BMP is saved in 16-color indexed (4 bpp) format (256x240, exactly 30,838 bytes file size).
2. **Save as TVC bin:** Raw binary data for real TVC or emulator.
   *   *TVC256k++ mode:* 256x240 16-color image with 2 points per byte (1st point upper 4 bits, 2nd point lower 4 bits IRGB code, total 30,720 bytes).
3. **Save as ZX7 bin:** Binary data compressed with the ZX7 algorithm (with `.bin.zx7` extension), which takes up less space and loads faster on the TVC.

*Filenames automatically include the color/resolution mode suffix (e.g., `_16c`, `_4c`, `_2c`, `_256k`). In 16-color mode, the BMP filename will also include the aspect ratio (e.g., `_1_1` or `_2_1`). Each button has a short description (tooltip) that appears when you hover the mouse over it.*

### 2.8. Advanced Image Processing
New in v3.8 and v3.9, these tools help you prepare your image for the best possible conversion.

*   **Denoising:** Reduces digital noise in the source image. This is especially useful for photos, as it prevents the dithering algorithm from "dotting" the noise, resulting in cleaner, more cohesive surfaces on the TVC.
*   **Unsharp Mask:** A fine sharpening tool that enhances important edges (like the outlines of a face). This helps details "survive" the downscaling process and prevents the final image from looking too blurry.
*   **Tone Mapping:** Compresses the dynamic range of high-contrast images. If your photo has very dark and very bright areas simultaneously, tone mapping helps bring out details in both, making them visible within the TVC's limited palette.
*   **Serpentine Scanning:** Changes the direction of the dithering process for every other line. This breaks up vertical "streaks" and creates more natural-looking dithering patterns.
*   **Perceptual Color Distance:** When enabled, the program calculates color similarity based on how the human eye actually perceives colors (giving more weight to green and less to blue). This results in much more natural-looking color substitutions.
*   **Pixel Art Cleaning:** Automatically removes isolated "stray" pixels that can sometimes appear during dithering. This results in a much cleaner, more "hand-drawn" look, especially for graphics and illustrations.
*   **Smooth Resize:** By default the source image is downscaled with nearest-neighbor sampling: each destination pixel takes a single source pixel. This is fast, and the resulting fine noise often reads as a pleasant, "hand-drawn" texture after dithering - but it can cause aliasing on photographs. When enabled, the program instead performs **gamma-correct area averaging**: each destination pixel is the average of its entire source footprint, computed in linear light (the same principle used by the Yliluoma dither's color mixing). The result is cleaner and less aliased, and generally better for photographic sources. For pixel-art-like sources it is usually better left off.
*   **Precise Auto Color (Lab):** Only in 4 and 2 color modes, and only with "Auto Color" enabled. Automatic color selection measures color distance using the fast *redmean* approximation by default; when enabled it uses the perceptually uniform **CIELAB** space instead, which is notably more accurate in the blue-purple range. Since this step runs only once per conversion (not per pixel), the extra computation is effectively free.
*   **Auto Color Selection (K-Means):** For 4-color and 2-color modes, this uses a sophisticated mathematical algorithm (K-Means clustering) to find the mathematically optimal set of colors for your specific image, rather than just picking the most frequent ones.
*   **Transparent Background Masking (TVC256k++ / Sprites):** Located on the Composition panel, this automatically maps the solid background surrounding the active drawing. Outer pixels are converted to the **9th black (`1000` / `0x8` transparent)** code, while inner black parts of the subject are protected. The mask is displayed on screen using a distinct neon-magenta pattern which can be toggled on/off, and exported into BMP and BIN files with the transparent code.

### 2.9. Saving and Loading Settings
On the left panel, you can save your current settings into 3 slots. You can load saved settings at any time using the corresponding number buttons. You can delete saved slots using the small 'x' button in the corner of the button.

Next to the 3 quick slots, each side also has a **4th button**:
*   **Save to file (download icon):** Asks for a name, then downloads a `.tvcset` file. Its contents are pretty-printed, human-readable JSON, so it can be opened and even hand-edited in any text editor.
*   **Load from file (upload icon):** Loads a previously saved `.tvcset` file back.

Unlike the quick slots, this allows an arbitrary name and **physically downloads** to your machine - so it can be copied, sent to someone, kept as a backup, and loaded on another machine or browser.

## 3. Pixel Editor
A standalone editor for hand-refining the converted image pixel by pixel. **All four video modes are supported:** 16-color (128x240, 2:1 aspect), TVC256k++ (256x240, square), 4-color (256x240) and 2-color (512x240).

**Opening:**
*   Next to a finished conversion, the **"Pixel Editor"** button in the row below the preview opens the current image for editing (in 16, 4 and 2 color modes).
*   On the start screen (before loading an image), four links open a blank (black) canvas directly in any mode.
*   The **"Open"** button inside the editor loads the app's own earlier exports back **without conversion**: `.bmp`, `.bin` and ZX7-compressed `.bin.zx7` files alike. Resolution and mode are detected automatically (from the header for BMP, from file size for BIN).
    *   *Note:* 16, 4 and 2 color BIN files are all exactly 15,360 bytes, so they cannot be told apart by size. The program therefore prefers the **editor's current mode** when it fits the size - so reloading your own work never asks unnecessarily. If the size matches none exactly, a picker appears with the most likely guess preselected.
*   **"Back to converter"** returns to the converter - edits made in the editor are not carried back, they can only be exported from the editor. If you have unsaved changes, confirmation is requested.
*   The editor has its own **language selector** in the top right; it shares the converter's setting, so both interfaces always stay in the same language.

**View and navigation:**
*   **Zoom:** mouse wheel, centered on the cursor. The starting zoom matches each mode's native size: the 2-color mode (512 pixels wide) opens at 1:1, the narrower modes open pre-zoomed.
*   **Pan:** hold the middle mouse button and drag, or use the native scrollbars.
*   Above a certain zoom level a thin pixel grid is shown; it can be toggled with the toolbar icon.
*   **Transparency highlight toggle** (16-color modes only, eye icon): transparent pixels are shown by default as a vivid magenta-black checkerboard. Since that pattern can be mistaken for a dithered surface, the toggle switches it to plain black - showing what the image will actually look like.
*   A small live preview in the side panel shows the whole image at the correct final aspect ratio.

**Drawing tools:**
*   **Pencil, Line, Rectangle (outline), Filled rectangle, Ellipse, Fill (bucket), Select.**
*   The **thickness** slider controls pencil and line tool width.
*   **Undo / Redo:** up to 20 steps, via `Ctrl+Z` and `Ctrl+Y` (or `Ctrl+Shift+Z`), or the toolbar buttons.

**Checkerboard fill:**
Enabled with the toolbar toggle, **every** drawing tool paints using a checkerboard of the primary and secondary colors - not just filled shapes, but the pencil, line, outlines and paint bucket too, live preview included. Left and right mouse button select which of the two phases is used (i.e. which color lands on the even squares), making it easy to draw two interlocking patterns.

**Select, cut and move:**
The select tool lifts a rectangular region and moves it as a floating layer:
1.  Drag a rectangle - the selected area is **lifted** off the image (leaving the palette's first color, i.e. black, behind) and floats above it with a dashed outline.
2.  The floating piece can be **re-grabbed and dragged again** any number of times. The **arrow keys** also nudge it, pixel by pixel.
3.  Place it: **Enter**, the green check button, or click outside the selection.
4.  Cancel: **Esc** or the X button - the piece returns to its original position.

The whole cut-and-move is treated as a **single undoable step**, so one `Ctrl+Z` reverts all of it. If you switch tools with a selection still floating, the program places it down rather than silently discarding it.

**Image transforms:**
*   **Horizontal and vertical flip.**
*   **Scroll** up / down / left / right, one pixel per click. Scrolling **wraps around**: whatever leaves one edge reappears on the opposite side, so nothing is lost.
*   All of these are undoable.

**Colors:**
*   **Left mouse button** draws with the primary color, **right button** with the secondary. Left-click a palette swatch to set the primary, right-click to set the secondary.
*   *In 16-color modes* the palette holds the 15 real TVC colors plus a 16th **"transparent"** swatch (the hardware's 9th black, used by the TVC for masked pixels). On save the program automatically switches to the correct transparency code and mask.
*   *In 4 and 2 color modes* only that mode's active 4 or 2 colors are shown (there is no transparent swatch here, as the hardware bit packing has no room for one). Each swatch has a small **pencil icon** in its corner: clicking it lets you pick a new color for that slot from the full 15-color TVC palette. Changing it also **recolors the already-drawn pixels**, so the image doesn't fall apart, and the step is undoable.
*   If the **mask** was enabled in the converter (TVC256k++ mode), the masked pixels automatically appear as transparent in the editor.

**Reset:** the toolbar's reset button restores the image to its state when opened. Since this discards every edit, confirmation is always requested (and the step itself is undoable).

**Saving:** the same formats are available as in the converter: **BMP (1:1)**, plus **BMP (2:1)** in 16-color mode, **BIN**, and **BIN (ZX7 compressed)**. Filenames automatically get an `_edit` marker and the mode suffix (`_16c`, `_4c`, `_2c`, `_256k`).

## 4. Tips
*   TVC pixels are wide; portrait images often look better rotated.
*   Use "Auto-Tune" if you don't know where to start.
*   Use "Native Size Preview" (eye icon) to see the final TVC look.
*   Experiment with the "Solid Area Snap" setting when using dithering to keep flat backgrounds clean while still smoothing gradients.
*   For high-contrast images, the "Threshold (No pattern)" method often provides the sharpest, most striking results.
*   If your image has a lot of fine text, try the 2-color or 4-color modes, as their higher horizontal resolution makes text much more legible.
*   When preparing images for a real CRT TV, remember that colors will bleed slightly; the "Pattern TVC" dithering method is specifically designed to exploit this blending.
*   **Advanced Tip:** For the best results with photos, try enabling **Perceptual Color Distance** and **Serpentine Scanning** together. If the image looks a bit "muddy", a small amount of **Unsharp Mask** (around 20-30%) can make a huge difference.
