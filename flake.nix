{
  description = "Nexus — local-first repo fleet triage CLI";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        manifest = (builtins.fromTOML (builtins.readFile ./Cargo.toml)).workspace.package;
      in
      {
        packages.nexus-cli = pkgs.rustPlatform.buildRustPackage {
          pname = "nexus-cli";
          version = manifest.version;
          src = ./.;
          cargoLock.lockFile = ./Cargo.lock;
          cargoBuildFlags = [ "--package" "nexus-cli" ];
        };
        packages.default = self.packages.${system}.nexus-cli;
        apps.default = flake-utils.lib.mkApp {
          drv = self.packages.${system}.nexus-cli;
          name = "nexus";
        };
      });
}
