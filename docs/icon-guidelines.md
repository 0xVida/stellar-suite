# Stellar Kit Icon Guidelines

This document outlines the usage, context, and variations of the **Stellar Kit** (prev. Stellar Suite) extension icons to ensure maximum brand consistency across the Visual Studio Code ecosystem and external marketing materials.

## 1. Icon Contexts & Usage

The extension utilizes three distinct categories of icons:
    
### A. Marketplace Icons
The Marketplace icons are full-color, rich representations of the Stellar Kit brand. They should be used for the extension's primary listing on the VS Code Marketplace, GitHub repository main previews, and robust UI sections where the logo commands attention.

**Marketplace Icon (128x128)**
![Marketplace Icon 128](/Users/ogazboiz/code /open_source/stellar-suite/assets/marketplace-icon-128.png)

**Marketplace Icon (256x256)**
![Marketplace Icon 256](/Users/ogazboiz/code /open_source/stellar-suite/assets/marketplace-icon-256.png)

- **Primary Size**: `128x128` pixels (Minimal resolution required for standard listings).
- **High-Res Size**: `256x256` pixels (Optimal for high-DPI displays).
- **Style**: Rich colors (Cosmic Navy, Electric Cyan), subtle glassmorphism or sleek flat design, slightly rounded corners.

### B. Activity Bar Icons
Activity Bar icons are displayed within the VS Code sidebar when the extension is active or pinned. They must be legible against arbitrary themes.

- **Size Requirement**: Recommended `24x24` pixels.
- **Style Requirement**: Strictly monochromatic. Must convey the 'S' and star motif through outline or flat filled shapes without relying on color layers.
- **Variations**:
    - **Light Theme**: A solid dark icon against a transparent/light background.
    ![Activity Bar Light](/Users/ogazboiz/code /open_source/stellar-suite/assets/activity-bar-icon-light.png)
    - **Dark Theme**: A solid white/light icon against a transparent/dark background.
    ![Activity Bar Dark](/Users/ogazboiz/code /open_source/stellar-suite/assets/activity-bar-icon-dark.png)

### C. Promotional Banners
Used for social media drops, marketplace header graphics, or high-level README branding.

![Promotional Banner](/Users/ogazboiz/code /open_source/stellar-suite/assets/promotional-banner.png)

- **Sizing**: `1280x640` or standard Open Graph proportions.
- **Style**: Features the primary logo prominently against a `Cosmic Navy` background (`#0B1021`) flanked by `Electric Cyan` accents. 

## 2. Icon Scaling and Integrity

When rendering the logo:
1. **Never stretch or distort** the aspect ratio of the logo.
2. **Minimum Sizes**: Do not scale the full-color marketplace logo below `32x32` pixels. At resolutions smaller than this, revert to the simplified Activity Bar variant to maintain legibility.
3. **Contrast**: The full-color icons are inherently built for dark backgrounds. If placed on a pure white background, ensure adequate padding so the navy base provides enough contrast.

*(Assets referenced above are generated via the asset pipeline and located in the `assets/` directory.)*
