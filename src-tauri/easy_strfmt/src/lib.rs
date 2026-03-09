use std::{
    borrow::{Borrow, Cow},
    collections::{BTreeMap, HashMap},
    fmt::{self, Write},
    hash::{BuildHasher, Hash},
};

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum Error {
    #[error("Key not found: {0}")]
    KeyNotFound(String),
    #[error("'{{' not found")]
    UnmatchedOpenBrace,
    #[error("Unmatched '}}'")]
    UnmatchedCloseBrace,
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
        if let Some(pos) = bytes[i..].iter().position(|&b| b == b'{' || b == b'}') {
            w.write_str(&s[i..i + pos]).map_err(Error::WriteError)?;
            i += pos;

            if bytes[i] == b'{' {
                if i + 1 < len && bytes[i + 1] == b'{' {
                    w.write_char('{').map_err(Error::WriteError)?;
                    i += 2;
                } else {
                    i += 1;
                    if let Some(end_pos) = bytes[i..].iter().position(|&b| b == b'}') {
                        let var_name = &s[i..i + end_pos];
                        match m.get_value(var_name) {
                            Some(val) => {
                                w.write_str(val.as_ref()).map_err(Error::WriteError)?;
                            }
                            None => return Err(Error::KeyNotFound(var_name.to_string())),
                        }
                        i += end_pos + 1;
                    } else {
                        return Err(Error::UnmatchedOpenBrace);
                    }
                }
            } else {
                if i + 1 < len && bytes[i + 1] == b'}' {
                    w.write_char('}').map_err(Error::WriteError)?;
                    i += 2;
                } else {
                    return Err(Error::UnmatchedCloseBrace);
                }
            }
        } else {
            w.write_str(&s[i..]).map_err(Error::WriteError)?;
            break;
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

        let result = strfmt("Hello {name}, you are {adj}! {foo}", &vars).unwrap();
        assert_eq!(result, "Hello Rust, you are awesome! bar");
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
    fn test_errors() {
        let vars = [("a", "b")];

        assert_eq!(
            strfmt("{c}", &vars[..]),
            Err(Error::KeyNotFound("c".to_string()))
        );

        assert_eq!(
            strfmt("hello {a", &vars[..]),
            Err(Error::UnmatchedOpenBrace)
        );

        assert_eq!(
            strfmt("hello }", &vars[..]),
            Err(Error::UnmatchedCloseBrace)
        );
    }
}
