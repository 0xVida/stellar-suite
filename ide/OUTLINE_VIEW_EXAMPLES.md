# Outline View - Usage Examples

## Example 1: Simple Contract

### Source Code
```rust
#[contract]
pub struct Counter;

#[contractimpl]
impl Counter {
    pub fn increment(env: Env) -> u32 {
        let count = get_count(&env);
        let new_count = count + 1;
        set_count(&env, new_count);
        new_count
    }
    
    pub fn get_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}
```

### Outline View Display
```
Counter (struct, pub)
impl Counter
  ├─ increment (function, pub) :6
  └─ get_count (function, pub) :14
```

## Example 2: Token Contract with Multiple Types

### Source Code
```rust
#[contracttype]
pub enum DataKey {
    Admin,
    Balance(Address),
}

#[contract]
pub struct Token;

#[contractimpl]
impl Token {
    pub fn initialize(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }
    
    pub fn balance(env: Env, addr: Address) -> i128 {
        env.storage().instance().get(&DataKey::Balance(addr)).unwrap_or(0)
    }
    
    fn internal_helper() {
        // Private helper
    }
}

pub const MAX_SUPPLY: i128 = 1_000_000;
```

### Outline View Display
```
DataKey (enum, pub) :2
Token (struct, pub) :8
impl Token
  ├─ initialize (function, pub) :12
  ├─ balance (function, pub) :16
  └─ internal_helper (function, private) :20
MAX_SUPPLY (const, pub) :25
```

## Example 3: Complex Contract with Traits

### Source Code
```rust
pub trait Upgradeable {
    fn upgrade(env: Env, new_wasm: BytesN<32>);
}

#[contract]
pub struct MyContract;

impl Upgradeable for MyContract {
    fn upgrade(env: Env, new_wasm: BytesN<32>) {
        // Implementation
    }
}

#[contractimpl]
impl MyContract {
    pub fn init(env: Env) {}
    pub fn execute(env: Env, action: Action) {}
}

type Result<T> = core::result::Result<T, Error>;

mod tests;
```

### Outline View Display
```
Upgradeable (trait, pub) :1
MyContract (struct, pub) :6
impl Upgradeable
  └─ upgrade (function, private) :9
impl MyContract
  ├─ init (function, pub) :16
  └─ execute (function, pub) :17
Result (type, pub) :20
tests (mod, private) :22
```

## Example 4: Macro-Heavy Code

### Source Code
```rust
macro_rules! storage_key {
    ($name:ident) => {
        pub const $name: &str = stringify!($name);
    };
}

storage_key!(ADMIN);
storage_key!(BALANCE);

pub fn get_admin(env: Env) -> Address {
    env.storage().instance().get(&ADMIN).unwrap()
}
```

### Outline View Display
```
storage_key (macro, private) :1
get_admin (function, pub) :10
```

Note: Macro invocations (lines 7-8) are not shown, only the macro definition.

## Example 5: Nested Impl Blocks

### Source Code
```rust
pub struct Outer;

impl Outer {
    pub fn outer_method() {}
}

impl Outer {
    pub fn another_method() {}
    
    fn private_method() {}
}
```

### Outline View Display
```
Outer (struct, pub) :1
impl Outer
  └─ outer_method (function, pub) :4
impl Outer
  ├─ another_method (function, pub) :8
  └─ private_method (function, private) :10
```

Note: Multiple impl blocks for the same type are shown separately.

## Navigation Workflow

### Quick Jump to Definition

1. Open a Rust file in the editor
2. Click the Outline icon in the Activity Bar
3. Browse the symbol list
4. Click any symbol to jump to its definition
5. The editor scrolls and centers the line
6. Cursor is positioned at the start of the symbol

### Finding Public API

1. Open the Outline View
2. Look for symbols with green "pub" badges
3. These represent your contract's public interface
4. Click to review implementation details

### Reviewing Impl Block Methods

1. Locate the impl block in the outline
2. Click to expand/collapse the method list
3. Methods are indented under their impl block
4. Click individual methods to navigate

### Current Position Awareness

1. As you move the cursor in the editor
2. The outline automatically highlights the current symbol
3. Helps maintain context in large files

## Tips and Tricks

### Rapid Navigation
- Use the outline to quickly jump between functions without scrolling
- Especially useful in files with 500+ lines

### Code Review
- Check visibility of all symbols at a glance
- Ensure private helpers are not accidentally public

### Refactoring
- See the full structure before moving code
- Identify which methods belong to which impl blocks

### Learning Codebases
- Get an overview of a file's structure instantly
- Understand the organization without reading every line

## Integration with Other Features

### File Explorer
- Switch files in the explorer
- Outline updates automatically to show new file's symbols

### Breadcrumbs
- Breadcrumbs show file path
- Outline shows symbol structure
- Together they provide complete navigation context

### Search
- Use search to find files
- Use outline to navigate within files

## Accessibility

- All interactive elements are keyboard accessible
- ARIA labels provided for screen readers
- High contrast icons for visibility
- Semantic HTML structure

## Performance Notes

- Symbol parsing is fast (<50ms for typical files)
- Parsing only happens when file content changes
- No impact on typing or editing performance
- Efficient memoization prevents unnecessary re-renders
