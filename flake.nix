{
  description = "Workout Tracker";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }: {
    devShells.x86_64-linux.default =
      let
        pkgs = import nixpkgs {
          system = "x86_64-linux";
          config.allowUnfree = true;
        };
      in
      pkgs.mkShell {
        packages = [ 
          pkgs.nodejs_22
          pkgs.supabase-cli
          pkgs.docker
          pkgs.bruno
          pkgs.postgresql
        ];
      };
  };
}
