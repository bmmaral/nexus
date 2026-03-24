//! Optional CLI adapters (jscpd, semgrep, gitleaks, syft). They never block the core pipeline.
use anyhow::Result;
use nexus_core::{EvidenceItem, InventorySnapshot, MemberKind, PlanDocument};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExternalTool {
    Jscpd,
    Semgrep,
    Gitleaks,
    Syft,
}

impl ExternalTool {
    pub fn bin_name(self) -> &'static str {
        match self {
            ExternalTool::Jscpd => "jscpd",
            ExternalTool::Semgrep => "semgrep",
            ExternalTool::Gitleaks => "gitleaks",
            ExternalTool::Syft => "syft",
        }
    }
}

/// Whether each supported tool is on `PATH`.
pub fn probe_all() -> Vec<(ExternalTool, bool)> {
    [
        ExternalTool::Jscpd,
        ExternalTool::Semgrep,
        ExternalTool::Gitleaks,
        ExternalTool::Syft,
    ]
    .into_iter()
    .map(|t| (t, which::which(t.bin_name()).is_ok()))
    .collect()
}

/// Wall-clock limit per adapter invocation. Override with `NEXUS_ADAPTER_TIMEOUT_SECS` (1–86400).
fn adapter_timeout() -> Duration {
    const DEFAULT: Duration = Duration::from_secs(180);
    std::env::var("NEXUS_ADAPTER_TIMEOUT_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .filter(|&s| (1..=86_400).contains(&s))
        .map(Duration::from_secs)
        .unwrap_or(DEFAULT)
}

fn run_capture(bin: &str, args: &[&str], cwd: &Path) -> Option<(i32, String)> {
    let _ = which::which(bin).ok()?;
    let timeout = adapter_timeout();

    let mut child = Command::new(bin)
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_handle = thread::spawn(move || {
        let mut s = String::new();
        if let Some(mut out) = stdout {
            let _ = out.read_to_string(&mut s);
        }
        s
    });
    let stderr_handle = thread::spawn(move || {
        let mut s = String::new();
        if let Some(mut err) = stderr {
            let _ = err.read_to_string(&mut s);
        }
        s
    });

    let start = Instant::now();
    loop {
        let waited = match child.try_wait() {
            Ok(s) => s,
            Err(_) => return None,
        };
        match waited {
            Some(status) => {
                let code = status.code().unwrap_or(-1);
                let stdout = stdout_handle.join().unwrap_or_default();
                let stderr = stderr_handle.join().unwrap_or_default();
                let msg = if !stderr.trim().is_empty() {
                    stderr.trim().to_string()
                } else {
                    stdout.trim().to_string()
                };
                let short = msg.lines().next().unwrap_or("").to_string();
                return Some((
                    code,
                    if short.is_empty() {
                        format!("exit {code}")
                    } else {
                        short
                    },
                ));
            }
            None => {
                if start.elapsed() >= timeout {
                    if let Err(e) = child.kill() {
                        tracing::warn!(tool = %bin, error = %e, "failed to kill timed-out adapter");
                    }
                    let _ = child.wait();
                    let _ = stdout_handle.join();
                    let _ = stderr_handle.join();
                    let secs = timeout.as_secs();
                    tracing::warn!(tool = %bin, seconds = secs, "external adapter timed out");
                    return Some((124, format!("timed out after {secs}s")));
                }
                thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

/// Append lightweight evidence rows for each cluster’s canonical clone when tools exist.
pub fn attach_external_evidence(
    plan: &mut PlanDocument,
    snapshot: &InventorySnapshot,
) -> Result<()> {
    let by_id: HashMap<_, _> = snapshot.clones.iter().map(|c| (c.id.clone(), c)).collect();

    for cp in &mut plan.clusters {
        let Some(cid) = cp.cluster.canonical_clone_id.as_ref() else {
            continue;
        };
        let Some(clone) = by_id.get(cid) else {
            continue;
        };
        let root = Path::new(clone.path.as_str());
        if !root.is_dir() {
            continue;
        }

        if let Some((_c, s)) = run_capture(
            "gitleaks",
            &["detect", "-s", ".", "--exit-code", "0", "--no-banner"],
            root,
        ) {
            cp.cluster
                .evidence
                .push(evid(cid, "gitleaks_detect", 0.0, format!("gitleaks: {s}")));
        }

        if let Some((_c, s)) = run_capture(
            "semgrep",
            &["scan", "--config", "p/ci", "--quiet", "--error", "."],
            root,
        ) {
            cp.cluster
                .evidence
                .push(evid(cid, "semgrep_scan", 0.0, format!("semgrep: {s}")));
        }

        if let Some((_c, s)) = run_capture("jscpd", &[".", "--silent", "--min-lines", "10"], root) {
            cp.cluster
                .evidence
                .push(evid(cid, "jscpd_scan", 0.0, format!("jscpd: {s}")));
        }

        if let Some((_c, s)) = run_capture("syft", &[".", "-o", "json"], root) {
            let tail = if s.len() > 240 {
                format!("{}…", &s[..240])
            } else {
                s
            };
            cp.cluster
                .evidence
                .push(evid(cid, "syft_sbom", 0.0, format!("syft: {tail}")));
        }
    }

    Ok(())
}

fn evid(clone_id: &str, kind: &str, delta: f64, detail: String) -> EvidenceItem {
    EvidenceItem {
        id: format!("ext-{}", uuid::Uuid::new_v4()),
        subject_kind: MemberKind::Clone,
        subject_id: clone_id.into(),
        kind: kind.into(),
        score_delta: delta,
        detail,
    }
}
