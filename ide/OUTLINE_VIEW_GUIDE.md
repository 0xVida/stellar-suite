# Outline View - Symbol Navigation Guide

## Overview

The Outline View provides a hierarchical display of all Rust symbols in the currently active file, enabling quick navigation through your code structure.

## Features

### Symbol Types Supported

The Outline View recognizes and displays the following Rust constructs:

- **Structs** - Data structures with fields
- **Enums** - Enumeration types
- **Functions** - Standalone functions and methods
- **Impl Blocks** - Implementation blocks with their methods
- **Traits** - Trait definitions
- **Consts** - Constant declarations
- **Type Aliases** - Type definitions
- **Modules** - Module declarations
- **Macros** - Macro definitions

### Visual Indicators

Each symbol type has a distinct icon and color:

- Structs: Blue box icon
- Enums: Purple braces icon
- Functions: Yellow function icon
- Macros: Pink lightning icon
- Impl blocks: Green code icon
- Traits: Cyan file-code icon
- Consts: Orange hash icon
- Type aliases: Indigo type icon
- Modules: Teal package icon

### Visibility Badges

Public symbols display a green "pub" badge to quickly identify the API surface of your contract.

## Usage

### Opening the Outline View

1. Click the "Outline" icon in the Activity Bar (left sidebar)
2. The Outline View will appear in the left sidebar panel

### Navigating to Symbols

1. Click any symbol in the outline
2. The editor will jump to that symbol's definition
3. The cursor will be positioned at the start of the symbol
4. The line will be centered in the editor viewport

### Impl Block Navigation

Impl blocks are collapsible:

1. Click the impl block header to expand/collapse
2. Methods within the impl are indented and grouped
3. Each method can be clicked to navigate to its definition

### Current Position Highlighting

The symbol at the current cursor position is highlighted in the outline, making it easy to see where you are in the file structure.

## Example

For a Soroban contract like:

```rust
#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env) -> String {
        String::from_str(&env, "Hello")
    }
    
    fn private_helper() {}
}

mod test;
```

The Outline View displays:

```
HelloContract (struct, pub)
impl HelloContract
  ├─ hello (function, pub)
  └─ private_helper (function, private)
test (mod, private)
```

## Limitations

- Only available for Rust (.rs) files
- Does not parse symbols inside nested modules
- Macro invocations are not tracked (only macro definitions)
- Generic type parameters are not displayed in detail

## Integration

The Outline View integrates seamlessly with:

- **File Explorer** - Switch files and the outline updates automatically
- **Code Editor** - Cursor position syncs with outline highlighting
- **Monaco Editor** - Uses Monaco's reveal and focus APIs for smooth navigation

## Technical Details

### Symbol Parser

The symbol parser (`rustSymbolParser.ts`) uses regex-based pattern matching to extract symbols from Rust source code. It tracks:

- Symbol names and types
- Line numbers for navigation
- Visibility modifiers (pub/private)
- Parent relationships (for impl block methods)
- Brace depth for accurate impl block tracking

### Performance

- Symbols are parsed on-demand when files change
- Parsing is memoized to avoid unnecessary re-computation
- Large files (1000+ lines) parse in <50ms

## Keyboard Shortcuts

Currently, the Outline View is mouse-driven. Future enhancements may include:

- Keyboard navigation within the outline
- Quick search/filter for symbols
- Breadcrumb integration showing current symbol path
