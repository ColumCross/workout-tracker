{
  description = "Workout Tracker";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }: {
    devShells.x86_64-linux.default =
      let
        pkgs = nixpkgs.legacyPackages.x86_64-linux;
      in
      pkgs.mkShell {
        packages = [ 
          pkgs.nodejs_22
          pkgs.supabase-cli
          pkgs.docker
        ];
      };
  };
}
