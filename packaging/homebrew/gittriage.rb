# Homebrew formula: build GitTriage from source (no per-arch binary checksums to update).
# Install:
#   brew install ./packaging/homebrew/gittriage.rb
# Or add this tap-style clone and:
#   brew install --formula packaging/homebrew/gittriage.rb
#
# After tagging a new release, bump `version` and `sha256` (source tarball):
#   curl -sL "https://github.com/bmmaral/gittriage/archive/refs/tags/vX.Y.Z.tar.gz" | shasum -a 256

class GitTriage < Formula
  desc "Local-first repo fleet triage CLI"
  homepage "https://github.com/bmmaral/gittriage"
  url "https://github.com/bmmaral/gittriage/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "d5558cd419c8d46bdc958064cb97f963d1ea793866414c025906ec15033512ed"
  license "MIT"
  head "https://github.com/bmmaral/gittriage.git", branch: "main"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(root: libexec, path: "crates/gittriage-cli")
    bin.install_symlink libexec/"bin"/"gittriage"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/gittriage --version")
  end
end
