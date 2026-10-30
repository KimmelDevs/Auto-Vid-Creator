// Story Maker Studio installer.
// Shows the licence, then downloads the app, a portable Node.js and the sound
// library into %LOCALAPPDATA%\StoryMaker and makes a desktop shortcut.
//
// Before building, set APP_URL and SOUNDS_URL to your uploaded zips
// (for example GitHub Releases). NODE_URL already points at an official build.

use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

const APP_NAME: &str = "Story Maker Studio";
// TODO: replace these two with your own uploaded zip links before shipping.
const APP_URL: &str = "https://example.com/StoryMaker-app.zip";
const SOUNDS_URL: &str = "https://example.com/StoryMaker-sounds.zip";
// Portable Node.js (Windows x64). The folder inside the zip is found after unzip.
const NODE_URL: &str = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-win-x64.zip";

const EULA: &str = include_str!("../../EULA.txt");

fn main() {
    if let Err(e) = run() {
        eprintln!("\nInstall failed: {e}");
    }
    pause("\nPress Enter to close.");
}

fn run() -> Result<(), String> {
    println!("==============================================");
    println!("   {APP_NAME} - installer");
    println!("==============================================\n");

    // 1. licence
    println!("{EULA}");
    print!("\nType  yes  to accept the licence and install: ");
    io::stdout().flush().ok();
    let mut answer = String::new();
    io::stdin().read_line(&mut answer).map_err(|e| e.to_string())?;
    if answer.trim().to_lowercase() != "yes" {
        return Err("licence not accepted".into());
    }

    // 2. install location
    let base = std::env::var("LOCALAPPDATA").map_err(|_| "no LOCALAPPDATA".to_string())?;
    let dir = PathBuf::from(base).join("StoryMaker");
    println!("\nInstalling to: {}", dir.display());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // 3. portable Node.js (only if the computer has none)
    let have_node = Command::new("node").arg("--version").output().map(|o| o.status.success()).unwrap_or(false);
    if have_node {
        println!("\n[1/3] Node.js found on this computer, skipping download.");
    } else {
        println!("\n[1/3] Downloading Node.js (about 30 MB)...");
        let zip = dir.join("node.zip");
        download(NODE_URL, &zip)?;
        println!("      Unpacking...");
        unzip(&zip, &dir)?;
        std::fs::remove_file(&zip).ok();
        // the zip holds one folder node-vXX-win-x64; rename it to "node"
        if let Some(folder) = first_dir_starting(&dir, "node-") {
            let target = dir.join("node");
            std::fs::remove_dir_all(&target).ok();
            std::fs::rename(&folder, &target).map_err(|e| e.to_string())?;
        }
    }

    // 4. the app
    println!("\n[2/3] Downloading {APP_NAME}...");
    let app_zip = dir.join("app.zip");
    download(APP_URL, &app_zip)?;
    println!("      Unpacking...");
    unzip(&app_zip, &dir)?;
    std::fs::remove_file(&app_zip).ok();

    // 4b. install the app's Node packages (needs internet; uses the bundled Node if present)
    if dir.join("package.json").exists() {
        println!("      Installing components (this can take a few minutes)...");
        npm_ci(&dir)?;
    }

    // 5. the sound and music library
    let sfx = dir.join("sfx");
    let have_sounds = sfx.join("manifest.json").exists();
    if have_sounds {
        println!("\n[3/3] Sound library already present, skipping.");
    } else {
        println!("\n[3/3] Downloading sound and music library (large, please wait)...");
        let snd = dir.join("sounds.zip");
        download(SOUNDS_URL, &snd)?;
        println!("      Unpacking...");
        unzip(&snd, &dir)?;
        std::fs::remove_file(&snd).ok();
    }

    // 6. desktop shortcut to the launcher
    let launcher = dir.join("StoryMaker.exe");
    if launcher.exists() {
        match make_shortcut(&launcher) {
            Ok(p) => println!("\nShortcut created: {p}"),
            Err(e) => println!("\n(Could not make a desktop shortcut: {e})\nYou can start it from {}", launcher.display()),
        }
    } else {
        println!("\nNote: StoryMaker.exe was not in the app package. Start the app from {}", dir.display());
    }

    println!("\nDone. {APP_NAME} is installed.");
    Ok(())
}

// ---- helpers: Windows PowerShell does the download, unzip and shortcut ----

fn powershell(script: &str) -> Result<(), String> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn download(url: &str, to: &Path) -> Result<(), String> {
    // TLS 1.2 and no progress bar makes Invoke-WebRequest fast and reliable
    let s = format!(
        "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '{}' -OutFile '{}'",
        url,
        to.display()
    );
    powershell(&s)
}

fn unzip(zip: &Path, to: &Path) -> Result<(), String> {
    let s = format!("Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force", zip.display(), to.display());
    powershell(&s)
}

fn make_shortcut(target: &Path) -> Result<String, String> {
    let link = "$([Environment]::GetFolderPath('Desktop'))\\Story Maker Studio.lnk";
    let s = format!(
        "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut('{link}'); $s.TargetPath='{t}'; $s.WorkingDirectory='{d}'; $s.Save()",
        t = target.display(),
        d = target.parent().unwrap().display()
    );
    powershell(&s)?;
    Ok("Desktop\\Story Maker Studio.lnk".into())
}

fn npm_ci(dir: &Path) -> Result<(), String> {
    let node = dir.join("node").join("node.exe");
    let npm_cli = dir.join("node").join("node_modules").join("npm").join("bin").join("npm-cli.js");
    let status = if node.exists() && npm_cli.exists() {
        Command::new(node).arg(npm_cli).arg("ci").arg("--omit=dev").current_dir(dir).status()
    } else {
        // system Node: npm is a .cmd, so go through cmd
        Command::new("cmd").args(["/c", "npm", "ci", "--omit=dev"]).current_dir(dir).status()
    };
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err("npm ci failed".into()),
        Err(e) => Err(e.to_string()),
    }
}

fn first_dir_starting(dir: &Path, prefix: &str) -> Option<PathBuf> {
    std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| {
        p.is_dir() && p.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with(prefix)).unwrap_or(false)
    })
}

fn pause(msg: &str) {
    print!("{msg}");
    io::stdout().flush().ok();
    let mut s = String::new();
    io::stdin().read_line(&mut s).ok();
}
