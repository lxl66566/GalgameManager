//! Lenient `strfmt`-style formatter: `{var}` placeholders are substituted
//! from a [`MapLike`] source, `{{`/`}}` escape literal braces.
//!
//! Anything that cannot be substituted is kept **verbatim** instead of
//! failing: unmatched braces and unknown variables pass through unchanged.
//! Rationale: this crate resolves user-provided paths (game dirs, save
//! paths), and Windows folder names may legitimately contain braces
//! (e.g. `New Folder {1}`) — a hard error there breaks launch/archive for a
//! perfectly valid path. The trade-off is that a *typo'd* variable no longer
//! errors either; it degrades to a literal path segment that downstream
//! path-existence checks (`paths_exist`, launch failures) surface to the
//! user, which is acceptable and far less opaque than a low-level
//! `KeyNotFound` error.

use std::{
    borrow::{Borrow, Cow},
    collections::{BTreeMap, HashMap},
    fmt::{self, Write},
    hash::{BuildHasher, Hash},
};

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum Error {
    #[error("Write error: {0}")]
    WriteError(fmt::Error),
}

pub trait MapLike {
    fn get_value(&self, key: &str) -> Option<Cow<'_, str>>;
}

impl<K, V, S> MapLike for HashMap<K, V, S>
where
    K: Eq + Hash + Borrow<str>,
    V: AsRef<str>,
    S: BuildHasher,
{
    #[inline]
    fn get_value(&self, key: &str) -> Option<Cow<'_, str>> {
        self.get(key).map(|v| Cow::Borrowed(v.as_ref()))
    }
}

impl<K, V> MapLike for BTreeMap<K, V>
where
    K: Ord + Borrow<str>,
    V: AsRef<str>,
{
    #[inline]
    fn get_value(&self, key: &str) -> Option<Cow<'_, str>> {
        self.get(key).map(|v| Cow::Borrowed(v.as_ref()))
    }
}

impl<K, V> MapLike for [(K, V)]
where
    K: Borrow<str>,
    V: AsRef<str>,
{
    #[inline]
    fn get_value(&self, key: &str) -> Option<Cow<'_, str>> {
        self.iter()
            .find(|(k, _)| k.borrow() == key)
            .map(|(_, v)| Cow::Borrowed(v.as_ref()))
    }
}

#[cfg(feature = "indexmap")]
impl<K, V, S> MapLike for indexmap::IndexMap<K, V, S>
where
    K: Eq + Hash + Borrow<str>,
    V: AsRef<str>,
    S: BuildHasher,
{
    #[inline]
    fn get_value(&self, key: &str) -> Option<Cow<'_, str>> {
        self.get(key).map(|v| Cow::Borrowed(v.as_ref()))
    }
}

pub fn strfmt_write<M: MapLike + ?Sized, W: Write>(mut w: W, s: &str, m: &M) -> Result<(), Error> {
    let bytes = s.as_bytes();
    let mut i = 0;
    let len = bytes.len();

    while i < len {
        let Some(pos) = bytes[i..].iter().position(|&b| b == b'{' || b == b'}') else {
            w.write_str(&s[i..]).map_err(Error::WriteError)?;
            break;
        };
        w.write_str(&s[i..i + pos]).map_err(Error::WriteError)?;
        i += pos;

        // Braces are ASCII, so slicing `s` at these byte offsets never splits
        // a UTF-8 sequence.
        if bytes[i] == b'{' {
            if i + 1 < len && bytes[i + 1] == b'{' {
                w.write_char('{').map_err(Error::WriteError)?;
                i += 2;
                continue;
            }
            match bytes[i + 1..].iter().position(|&b| b == b'}') {
                Some(end_pos) => {
                    let var_name = &s[i + 1..i + 1 + end_pos];
                    match m.get_value(var_name) {
                        Some(val) => w.write_str(val.as_ref()).map_err(Error::WriteError)?,
                        // Unknown variable: keep `{name}` verbatim.
                        None => w
                            .write_str(&s[i..=i + 1 + end_pos])
                            .map_err(Error::WriteError)?,
                    }
                    i += end_pos + 2;
                },
                // Unmatched open brace: emit verbatim.
                None => {
                    w.write_char('{').map_err(Error::WriteError)?;
                    i += 1;
                },
            }
        } else if i + 1 < len && bytes[i + 1] == b'}' {
            w.write_char('}').map_err(Error::WriteError)?;
            i += 2;
        } else {
            // Unmatched close brace: emit verbatim.
            w.write_char('}').map_err(Error::WriteError)?;
            i += 1;
        }
    }
    Ok(())
}

pub fn strfmt<M: MapLike + ?Sized>(s: &str, m: &M) -> Result<String, Error> {
    let mut out = String::with_capacity(s.len() + s.len() / 4 + 16);
    strfmt_write(&mut out, s, m)?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    #[test]
    fn test_hashmap_basic() {
        let mut vars = HashMap::new();
        vars.insert("name", "Rust");
        vars.insert("adj", "awesome");
        vars.insert("foo", "bar");
        vars.insert("", "empty");

        let result = strfmt("Hello {name}, you are {adj}! {foo} {}", &vars).unwrap();
        assert_eq!(result, "Hello Rust, you are awesome! bar empty");
    }

    #[test]
    fn test_tuple_slice() {
        let vars = [("var1", "developer"), ("var2", "code")];
        let result = strfmt("i'm a {var1}, writing {var2}.", &vars[..]).unwrap();
        assert_eq!(result, "i'm a developer, writing code.");
    }

    #[test]
    fn test_escape_braces() {
        let vars = [("name", "John")];
        let result = strfmt("{{ {name} }}", &vars[..]).unwrap();
        assert_eq!(result, "{ John }");
    }

    #[test]
    fn test_custom_struct_with_cow() {
        struct User {
            first_name: String,
            age: u32,
        }

        impl MapLike for User {
            fn get_value(&self, key: &str) -> Option<Cow<'_, str>> {
                match key {
                    "name" => Some(Cow::Borrowed(&self.first_name)),
                    "age" => Some(Cow::Owned(self.age.to_string())),
                    _ => None,
                }
            }
        }

        let user = User {
            first_name: "Alice".to_string(),
            age: 28,
        };

        let result = strfmt("{name} is {age} years old.", &user).unwrap();
        assert_eq!(result, "Alice is 28 years old.");
    }

    #[test]
    fn test_unresolvable_is_kept_verbatim() {
        let vars = [("a", "b")];

        // Unknown variable
        assert_eq!(strfmt("{c}", &vars[..]).unwrap(), "{c}");
        // Unmatched open brace
        assert_eq!(strfmt("hello {a", &vars[..]).unwrap(), "hello {a");
        // Unmatched close brace
        assert_eq!(strfmt("hello }", &vars[..]).unwrap(), "hello }");
        // A Windows-style auto-generated folder name must survive untouched.
        let empty: [(&str, &str); 0] = [];
        assert_eq!(
            strfmt("New Folder {1}", &empty[..]).unwrap(),
            "New Folder {1}"
        );
        // Known variables still substitute around verbatim fragments.
        assert_eq!(
            strfmt("{a} and {unknown} ({", &vars[..]).unwrap(),
            "b and {unknown} ({"
        );
    }
}
