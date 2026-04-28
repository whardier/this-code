mod cli;
mod config;
mod db;
mod install;
mod query;
mod shim;
mod which;

use anyhow::Result;
use clap::Parser as _;
use cli::{Cli, Commands};
use config::load_config;

fn main() -> Result<()> {
    // Initialize tracing subscriber with env-filter support.
    // Respects RUST_LOG env var (e.g., RUST_LOG=debug ./this-code install).
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    let config = load_config()?;
    tracing::debug!(?config, "config loaded");

    // Detect shim mode BEFORE Cli::parse().
    // When invoked as "code", ALL argument patterns are pass-through (D-06).
    // Checking before parse prevents `code install` from matching the Install arm
    // instead of passing through to the real `code` binary.
    // On Linux, current_exe() resolves symlinks via /proc/self/exe — use argv[0] instead.
    let invoked_as_code = std::env::args().next().is_some_and(|a| {
        std::path::Path::new(&a)
            .file_name()
            .is_some_and(|n| n == "code")
    });

    if invoked_as_code {
        return shim::run_shim(&config);
    }

    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Query { path, json }) => query::run_query(&config, path, json),
        Some(Commands::Which { path, json }) => which::run_which(&config, path, json),
        Some(Commands::Install { fish }) => install::run_install(fish),
        None => {
            // Invoked as "this-code" with no subcommand: print help and exit 0.
            use clap::CommandFactory as _;
            Cli::command().print_help()?;
            println!();
            Ok(())
        }
    }
}
