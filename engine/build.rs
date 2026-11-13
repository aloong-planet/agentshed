use std::path::Path;

fn main() {
    // The link arguments a Node-API module needs on each platform (on macOS, Node's symbols resolve at load)
    napi_build::setup();
    // The build this module belongs to, given by scripts/build-engine.mjs: a new one rebuilds the module
    println!("cargo:rerun-if-env-changed=AGENTSHED_ENGINE_BUILD");
    println!("cargo:rerun-if-changed=src");
    let mut uncaught = Vec::new();
    for_each_source(Path::new("src"), &mut |file, text| {
        let parsed = syn::parse_file(text).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
        uncaught_exports(&parsed.items, &file.display().to_string(), &mut uncaught);
    });
    // A function exported without it is called through `extern "C"`, where a panic ends the whole application rather
    // than failing the call (token-stats, Scans and the window: a panic is caught where it crosses into the application)
    if !uncaught.is_empty() {
        panic!(
            "every function the engine module exports must catch a panic: write #[napi(catch_unwind)] on {}",
            uncaught.join(", ")
        );
    }
}

fn for_each_source(dir: &Path, visit: &mut dyn FnMut(&Path, &str)) {
    let mut entries: Vec<_> = std::fs::read_dir(dir).expect("src is readable").map(|e| e.expect("src entry").path()).collect();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            for_each_source(&path, visit);
        } else if path.extension().is_some_and(|e| e == "rs") {
            visit(&path, &std::fs::read_to_string(&path).expect("source is readable"));
        }
    }
}

/// The functions among `items` (inline modules and impl blocks included) that carry `#[napi]` without `catch_unwind`
fn uncaught_exports(items: &[syn::Item], file: &str, out: &mut Vec<String>) {
    for item in items {
        match item {
            syn::Item::Fn(f) => check(&f.attrs, &f.sig.ident, file, out),
            syn::Item::Mod(m) => {
                if let Some((_, inner)) = &m.content {
                    uncaught_exports(inner, file, out);
                }
            }
            syn::Item::Impl(i) => {
                for member in &i.items {
                    if let syn::ImplItem::Fn(f) = member {
                        check(&f.attrs, &f.sig.ident, file, out);
                    }
                }
            }
            _ => {}
        }
    }
}

fn check(attrs: &[syn::Attribute], name: &syn::Ident, file: &str, out: &mut Vec<String>) {
    for attr in attrs {
        let is_napi = attr.path().segments.last().is_some_and(|s| s.ident == "napi");
        if !is_napi {
            continue;
        }
        let catches = match &attr.meta {
            syn::Meta::List(list) => list.tokens.clone().into_iter().any(|t| matches!(t, proc_macro2::TokenTree::Ident(i) if i == "catch_unwind")),
            _ => false,
        };
        if !catches {
            out.push(format!("{name} ({file})"));
        }
    }
}
