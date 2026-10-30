// Story Maker Studio launcher.
// Starts the local server with the bundled (or system) Node.js and opens the
// browser. Closing this window stops the app.

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

const PORT: &str = "5173";

fn main() {
    let dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())).unwrap_or_else(|| PathBuf::from("."));

    let server = dir.join("studio").join("server.mjs");
    if !server.exists() {
        eprintln!("Cannot find studio\\server.mjs next to this program.");
        wait_enter();
        return;
    }

    // bundled node if the installer put one here, else whatever is on PATH
    let node = dir.join("node").join("node.exe");
    let node = if node.exists() { node.to_string_lossy().into_owned() } else { "node".into() };

    println!("Starting Story Maker Studio...");
    let mut child = match Command::new(&node)
        .arg(server)
        .current_dir(&dir)
        .env("PORT", PORT)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Could not start Node.js: {e}");
            wait_enter();
            return;
        }
    };

    // wait up to 30s for the server to accept connections, then open the browser
    let url = format!("http://localhost:{PORT}");
    let start = Instant::now();
    let mut opened = false;
    while start.elapsed() < Duration::from_secs(30) {
        if TcpStream::connect(("127.0.0.1", PORT.parse().unwrap())).is_ok() {
            Command::new("cmd").args(["/c", "start", "", &url]).spawn().ok();
            opened = true;
            break;
        }
        thread::sleep(Duration::from_millis(400));
    }
    if !opened {
        println!("Server is taking a while. Open {url} in your browser.");
    } else {
        println!("Open in your browser: {url}");
    }
    println!("Keep this window open while you work. Close it to stop Story Maker Studio.");

    child.wait().ok();
}

fn wait_enter() {
    use std::io::{self, Write};
    print!("Press Enter to close.");
    io::stdout().flush().ok();
    let mut s = String::new();
    io::stdin().read_line(&mut s).ok();
}
