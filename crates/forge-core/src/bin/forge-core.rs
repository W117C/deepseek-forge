//! Read-only Forge CLI: registry list/info and package validate/inspect.

use std::env;
use std::path::{Path, PathBuf};
use std::process::exit;

use forge_core::errors::ErrorEnvelope;
use forge_core::manifest::{load_legacy_agent_dir, load_package_file};
use forge_core::registry::{LocalRegistry, RegistryProvider};
use forge_core::ForgeError;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if let Err(err) = run(&args) {
        let envelope = ErrorEnvelope::from(err);
        eprintln!(
            "{}",
            serde_json::to_string_pretty(&envelope).unwrap_or_else(|_| {
                "{\"code\":\"IO\",\"human\":\"error serialization failed\"}".to_string()
            })
        );
        exit(1);
    }
}

fn run(args: &[String]) -> Result<(), ForgeError> {
    let command = match args.first() {
        Some(cmd) => cmd,
        None => {
            print_usage();
            return Err(ForgeError::InvalidManifest(
                "no command provided".to_string(),
            ));
        }
    };

    match command.as_str() {
        "registry" => run_registry(&args[1..]),
        "package" => run_package(&args[1..]),
        _ => {
            print_usage();
            Err(ForgeError::InvalidManifest(format!(
                "unknown command '{}'",
                command
            )))
        }
    }
}

fn run_registry(args: &[String]) -> Result<(), ForgeError> {
    let sub = match args.first() {
        Some(sub) => sub,
        None => {
            return Err(ForgeError::InvalidManifest(
                "registry requires a subcommand (list|info)".to_string(),
            ))
        }
    };

    match sub.as_str() {
        "list" => {
            let (registry, _) = parse_common(&args[1..]);
            let packages = LocalRegistry::open(registry).list_packages()?;
            println!("{}", serde_json::to_string_pretty(&packages)?);
            Ok(())
        }
        "info" => {
            let (registry, positional) = parse_common(&args[1..]);
            let id = positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("registry info requires a package ID".to_string())
            })?;
            let package = LocalRegistry::open(registry).get_package(id)?;
            println!("{}", serde_json::to_string_pretty(&package)?);
            Ok(())
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown registry subcommand '{}'",
            sub
        ))),
    }
}

fn run_package(args: &[String]) -> Result<(), ForgeError> {
    let sub = match args.first() {
        Some(sub) => sub,
        None => {
            return Err(ForgeError::InvalidManifest(
                "package requires a subcommand (validate|inspect)".to_string(),
            ))
        }
    };

    match sub.as_str() {
        "validate" => {
            let path = args.get(1).ok_or_else(|| {
                ForgeError::InvalidManifest(
                    "package validate requires a file or directory path".to_string(),
                )
            })?;
            let package = if Path::new(path).is_dir() {
                load_legacy_agent_dir(Path::new(path))?
            } else {
                load_package_file(Path::new(path))?
            };

            let mut output = serde_json::Map::new();
            output.insert("ok".to_string(), serde_json::Value::Bool(true));
            output.insert("id".to_string(), serde_json::Value::String(package.id));
            output.insert("type".to_string(), serde_json::to_value(&package.r#type)?);
            output.insert(
                "version".to_string(),
                serde_json::Value::String(package.version),
            );
            output.insert(
                "capabilities".to_string(),
                serde_json::to_value(&package.capabilities)?,
            );
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::Value::Object(output))?
            );
            Ok(())
        }
        "inspect" => {
            let (registry, positional) = parse_common(&args[1..]);
            let id = positional.first().ok_or_else(|| {
                ForgeError::InvalidManifest("package inspect requires a package ID".to_string())
            })?;
            let package = LocalRegistry::open(registry).get_package(id)?;
            println!("{}", serde_json::to_string_pretty(&package)?);
            Ok(())
        }
        _ => Err(ForgeError::InvalidManifest(format!(
            "unknown package subcommand '{}'",
            sub
        ))),
    }
}

fn parse_common(args: &[String]) -> (PathBuf, Vec<String>) {
    let mut registry = default_registry_path();
    let mut positional = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        if arg == "--registry" {
            if i + 1 < args.len() {
                registry = PathBuf::from(&args[i + 1]);
                i += 2;
                continue;
            }
        } else if let Some(value) = arg.strip_prefix("--registry=") {
            registry = PathBuf::from(value);
            i += 1;
            continue;
        }
        positional.push(arg.clone());
        i += 1;
    }
    (registry, positional)
}

fn default_registry_path() -> PathBuf {
    match env::var_os("HOME") {
        Some(home) => PathBuf::from(home).join(".deepseek-forge").join("registry"),
        None => PathBuf::from(".deepseek-forge").join("registry"),
    }
}

fn print_usage() {
    eprintln!(
        r#"forge-core - DeepSeek Forge core (read-only)

USAGE:
  forge-core registry list [--registry PATH]
  forge-core registry info ID [--registry PATH]
  forge-core package validate FILE-OR-DIR
  forge-core package inspect ID [--registry PATH]"#
    );
}
