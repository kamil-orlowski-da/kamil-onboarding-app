let
  # Pinned to the same nixpkgs revision as ~/da/cf-docs, so both repos resolve to
  # the same store paths and entering this shell costs nothing extra.
  #
  # To get the sha256 after bumping the rev:
  # nix-prefetch-url --unpack https://github.com/NixOS/nixpkgs/archive/<the rev>.tar.gz
  rev = "ec942ba042dad5ef097e2ef3a3effc034241f011";
  sha256 = "sha256:01i5lznyfxyb5r7llscybv17nhbnb58p0wi62rag9jdagjwxm6a7";

  pkgs = import (builtins.fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/${rev}.tar.gz";
    inherit sha256;
  }) {};
in
pkgs.mkShell {
  # Node 22 to match `engines.node` in backend/package.json and
  # frontend/package.json. Nothing else is needed: the whole app is TypeScript.
  packages = [ pkgs.nodejs_22 ];
}
