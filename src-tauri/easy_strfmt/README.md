# easy_strfmt

A fast, lightweight string formatting crate for maps and custom types via the `MapLike` trait.

## Quick Start

```rust
use easy_strfmt::strfmt;
use std::collections::HashMap;

let mut vars = HashMap::new();
vars.insert("name", "Rust");
vars.insert("adj", "awesome");

let result = strfmt("Hello {name}, you are {adj}!", &vars).unwrap();
assert_eq!(result, "Hello Rust, you are awesome!");
```

Use `{{` and `}}` to escape literal braces.

## MapLike Trait

Implement `MapLike` on your own types:

```rust
use std::borrow::Cow;
use easy_strfmt::{strfmt, MapLike};

struct User {
    first_name: String,
    age: u32,
}

impl MapLike for User {
    fn get_value(&self, key: &str) -> Option<Cow<'_, str>> {
        match key {
            "name" => Some(Cow::Borrowed(&self.first_name)),
            "age"  => Some(Cow::Owned(self.age.to_string())),
            _ => None,
        }
    }
}

let user = User { first_name: "Alice".into(), age: 28 };
let result = strfmt("{name} is {age} years old.", &user).unwrap();
assert_eq!(result, "Alice is 28 years old.");
```

Built-in implementations are provided for `HashMap`, `BTreeMap`, and `[(K, V)]` slices.

## Feature Flags

- `indexmap` — Adds `MapLike` support for `indexmap::IndexMap`.
