use std::path::Path;

fn main() {
    // The link arguments a Node-API module needs on each platform (on macOS, Node's symbols resolve at load)
    napi_build::setup();
    // The build this module belongs to, given by scripts/build-engine.mjs: a new one rebuilds the module
    println!("cargo:rerun-if-env-changed=AGENTSHED_ENGINE_BUILD");
    println!("cargo:rerun-if-changed=src");
    let mut exports = Vec::new();
    for_each_source(Path::new("src"), &mut |file, text| {
        let parsed = syn::parse_file(text).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
        collect_exports(&parsed.items, false, &file.display().to_string(), &mut exports);
    });
    // A function exported without it is called through `extern "C"`, where a panic ends the whole application rather
    // than failing the call (token-stats, Scans and the window: a panic is caught where it crosses into the application)
    let uncaught: Vec<_> = exports.iter().filter(|e| !e.catches).map(|e| e.label()).collect();
    if !uncaught.is_empty() {
        panic!(
            "every function the engine module exports must catch a panic: write #[napi(catch_unwind)] on {}",
            uncaught.join(", ")
        );
    }
    // Packaging builds without the test-seams feature and refuses a module exporting a name that starts with `seam`
    // (scripts/build-engine.mjs): that refusal covers every test seam only while a seam is named so, and only a seam is
    let misnamed: Vec<_> = exports.iter().filter(|e| e.behind_seams != e.name.starts_with("seam_")).map(|e| e.label()).collect();
    if !misnamed.is_empty() {
        panic!(
            "an export behind the test-seams feature is named seam_…, and no other export is: {}",
            misnamed.join(", ")
        );
    }
}

/// One function the module exports, as its source declares it
struct Export {
    name: String,
    file: String,
    catches: bool,
    behind_seams: bool,
}

impl Export {
    fn label(&self) -> String {
        format!("{} ({})", self.name, self.file)
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

/// The functions among `items` (inline modules and impl blocks included) that carry `#[napi]`; `behind_seams` says
/// whether the items sit inside a module compiled only with the test-seams feature
fn collect_exports(items: &[syn::Item], behind_seams: bool, file: &str, out: &mut Vec<Export>) {
    for item in items {
        match item {
            syn::Item::Fn(f) => export(&f.attrs, &f.sig.ident, behind_seams, file, out),
            syn::Item::Mod(m) => {
                if let Some((_, inner)) = &m.content {
                    collect_exports(inner, behind_seams || seams_only(&m.attrs), file, out);
                }
            }
            syn::Item::Impl(i) => {
                for member in &i.items {
                    if let syn::ImplItem::Fn(f) = member {
                        export(&f.attrs, &f.sig.ident, behind_seams || seams_only(&i.attrs), file, out);
                    }
                }
            }
            _ => {}
        }
    }
}

fn export(attrs: &[syn::Attribute], name: &syn::Ident, behind_seams: bool, file: &str, out: &mut Vec<Export>) {
    let Some(napi) = attrs.iter().find(|a| a.path().segments.last().is_some_and(|s| s.ident == "napi")) else {
        return;
    };
    let catches = match &napi.meta {
        syn::Meta::List(list) => list.tokens.clone().into_iter().any(|t| matches!(t, proc_macro2::TokenTree::Ident(i) if i == "catch_unwind")),
        _ => false,
    };
    out.push(Export { name: name.to_string(), file: file.to_string(), catches, behind_seams: behind_seams || seams_only(attrs) });
}

/// Whether the attributes compile the item only with the test-seams feature: exactly `#[cfg(feature = "test-seams")]`,
/// not a condition that merely mentions the feature, such as `not(feature = "test-seams")`
fn seams_only(attrs: &[syn::Attribute]) -> bool {
    attrs.iter().any(|a| {
        let syn::Meta::List(list) = &a.meta else { return false };
        let tokens: Vec<_> = list.tokens.clone().into_iter().collect();
        a.path().is_ident("cfg")
            && matches!(
                tokens.as_slice(),
                [proc_macro2::TokenTree::Ident(f), proc_macro2::TokenTree::Punct(eq), proc_macro2::TokenTree::Literal(l)]
                    if f == "feature" && eq.as_char() == '=' && l.to_string() == "\"test-seams\""
            )
    })
}
