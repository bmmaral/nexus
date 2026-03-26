//! Canonical remote URL normalization for matching git remotes and GitHub inventory.

use url::Url;

/// Lowercase `host/path` form suitable for equality checks (HTTPS, HTTP, and `git@host:path`).
pub fn normalize_remote_url(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Ok(url) = Url::parse(trimmed) {
        let host = url.host_str().unwrap_or_default().to_lowercase();
        if host.is_empty() {
            return fallback(trimmed);
        }
        let path = url.path();
        let path = path.trim_start_matches('/').trim_end_matches('/');
        let path = path.trim_end_matches(".git").trim_end_matches('/');
        let path = path
            .split('/')
            .filter(|seg| !seg.is_empty())
            .collect::<Vec<_>>()
            .join("/")
            .to_lowercase();
        if path.is_empty() {
            return host;
        }
        return format!("{host}/{path}");
    }

    if let Some(stripped) = trimmed.strip_prefix("git@") {
        let normalized = stripped.replace(':', "/");
        return normalized.trim_end_matches(".git").to_lowercase();
    }

    fallback(trimmed)
}

fn fallback(s: &str) -> String {
    s.trim_end_matches(".git").trim_matches('/').to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn https_github() {
        assert_eq!(
            normalize_remote_url("https://github.com/Foo/Bar.git"),
            "github.com/foo/bar"
        );
    }

    #[test]
    fn ssh_github() {
        assert_eq!(
            normalize_remote_url("git@github.com:Foo/Bar.git"),
            "github.com/foo/bar"
        );
    }

    #[test]
    fn ssh_scheme_github() {
        assert_eq!(
            normalize_remote_url("ssh://git@github.com/Foo/Bar.git"),
            "github.com/foo/bar"
        );
    }

    #[test]
    fn git_scheme_github() {
        assert_eq!(
            normalize_remote_url("git://github.com/Foo/Bar.git"),
            "github.com/foo/bar"
        );
    }

    #[test]
    fn http_github_trailing_slash_and_slashes() {
        assert_eq!(
            normalize_remote_url("http://github.com/Foo/Bar//.git/"),
            "github.com/foo/bar"
        );
    }

    #[test]
    fn https_with_userinfo_still_normalizes_path() {
        assert_eq!(
            normalize_remote_url("https://user:token@github.com/Org/Repo.git"),
            "github.com/org/repo"
        );
    }

    #[test]
    fn host_only_url() {
        assert_eq!(normalize_remote_url("https://github.com/"), "github.com");
    }

    #[test]
    fn empty_after_trim() {
        assert_eq!(normalize_remote_url("   "), "");
    }
}
