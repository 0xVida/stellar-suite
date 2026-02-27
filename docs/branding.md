# Stellar Kit Brand Guidelines

This document outlines the visual identity and usage guidelines for the **Stellar Kit** extension (prev. Stellar Suite).

## 1. Brand Philosophy
Stellar Kit is a modern, developer-focused tool designed to feel integrated into the cutting-edge aesthetic of the Stellar blockchain ecosystem. The brand represents **simplicity, precision, and cosmic innovation.**

## 2. Typography
The typography system is designed for high readability inside IDEs and web applications.

### Primary Font: Inter
Used for all UI elements, headings, and general copy.
- **Headings**: Inter SemiBold (600)
- **Body**: Inter Regular (400)
- **Small Text**: Inter Medium (500)

### Monospace / Code Font: JetBrains Mono
Used exclusively for displaying code snippets, addresses, and hashes.
- **Code Blocks**: JetBrains Mono Regular (400)

## 3. Color Palette
The color palette balances a sleek "dark mode" developer feel with vibrant, energetic accents.

| Color Name | Hex Code | Usage |
| :--- | :--- | :--- |
| **Cosmic Navy** (Primary Background) | `#0B1021` | Main application background, dark panels |
| **Slate Gray** (Secondary Background) | `#1A2035` | Modals, cards, hovering elements |
| **Electric Cyan** (Primary Accent) | `#00D2FF` | Primary buttons, active states, links |
| **Stellar Blue** (Secondary Accent) | `#3A5AFE` | Secondary buttons, subtle highlights |
| **Stardust White** (Primary Text) | `#F8F9FA` | Main body text and prominent headers |
| **Muted Silver** (Secondary Text) | `#8E9CAE` | Helper text, disabled states, placeholders |

### Semantic Colors
- **Success (Green)**: `#00E676`
- **Warning (Yellow)**: `#FFD600`
- **Error (Red)**: `#FF1744`

## 4. Logo Guidelines
The logo system includes a primary icon alongside explicit light and dark variations. *(Assets generated and located in `assets/`)*

### Primary Logo (`assets/logo.png`)
Used as the root extension icon and default logo.
![Stellar Kit Logo](/Users/ogazboiz/code /open_source/stellar-suite/assets/logo.png)

### Dark Mode Logo (`assets/logo-dark.png`)
Optimized to stand out vividly against `#0B1021` backgrounds.
![Stellar Kit Logo Dark](/Users/ogazboiz/code /open_source/stellar-suite/assets/logo-dark.png)

### Light Mode Logo (`assets/logo-light.png`)
Optimized with harder contrasts for standard light-mode UIs (`#FFFFFF` backgrounds).
![Stellar Kit Logo Light](/Users/ogazboiz/code /open_source/stellar-suite/assets/logo-light.png)

### Clear Space & Sizing
- Always maintain clear space around the logo equivalent to 20% of the logo's width.
- Minimum size for digital display should be `24x24px`.

## 5. UI Application
- Use **Electric Cyan** sparingly for key calls to action (CTAs).
- Components should favor subtle borders (`1px solid #2A324A`) over heavy shadows to maintain a flat, modern aesthetic.
- Radius should be soft but sharp (`border-radius: 6px` for standard elements).
