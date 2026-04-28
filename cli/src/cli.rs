use clap::{Parser, Subcommand};

/// VS Code session tracker and launch interceptor.
#[derive(Parser)]
#[command(
    name = "this-code",
    version,
    about = "VS Code session tracker and launch interceptor"
)]
pub(crate) struct Cli {
    /// Subcommand to run (omit to run as code shim).
    #[command(subcommand)]
    pub command: Option<Commands>,
}

/// Available subcommands.
#[derive(Subcommand)]
pub(crate) enum Commands {
    /// Show the last-known session for a workspace path.
    Query {
        /// Workspace path to look up (default: current directory).
        path: Option<std::path::PathBuf>,
        /// Print what would be executed without running it.
        #[arg(long)]
        dry_run: bool,
        /// Output as JSON instead of human-readable table.
        #[arg(long)]
        json: bool,
    },
    /// Print the real `code` binary path (and matched workspace, if a session exists).
    Which {
        /// Workspace path to look up (default: current directory).
        path: Option<std::path::PathBuf>,
        /// Output as JSON instead of human-readable format.
        #[arg(long)]
        json: bool,
    },
    /// Install this-code shell integration (bash/zsh env file + code symlink).
    Install {
        /// Also write ~/.config/fish/conf.d/this-code.fish (idempotent).
        #[arg(long)]
        fish: bool,
    },
}
