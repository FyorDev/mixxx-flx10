{
  description = "Mixxx with Pioneer DDJ-FLX10 support (mapping, jog screens, Linux setup)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (pkgs: rec {
        mixxx-flx10 = pkgs.mixxx.overrideAttrs (old: {
          pname = "mixxx-flx10";
          version = "2.6-flx10";
          src = self;
          # The nixpkgs postPatch only adjusts the libdjinterop version of 2.5.
          postPatch = "";
          meta = old.meta // {
            description = "Mixxx with Pioneer DDJ-FLX10 support";
          };
        });

        flx10-setup = pkgs.writeShellScriptBin "flx10-setup" ''
          exec ${pkgs.python3.withPackages (p: [ p.pyusb ])}/bin/python3 \
            ${./res/controllers/flx10-autounlock/flx10_setup.py} "$@"
        '';

        default = mixxx-flx10;
      });

      nixosModules.flx10 = { config, lib, pkgs, ... }:
        let
          cfg = config.hardware.ddj-flx10;
          setup = self.packages.${pkgs.stdenv.hostPlatform.system}.flx10-setup;
          args = lib.concatStringsSep " "
            (lib.mapAttrsToList (name: value: "--${name} ${value}") cfg.settings);
        in
        {
          options.hardware.ddj-flx10 = {
            enable = lib.mkEnableOption "Pioneer DDJ-FLX10 support for Mixxx";
            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.stdenv.hostPlatform.system}.mixxx-flx10;
              description = "Mixxx package to install.";
            };
            settings = lib.mkOption {
              type = lib.types.attrsOf lib.types.str;
              default = { };
              example = { jog-ring-color = "2"; time-mode = "elapsed"; };
              description = ''
                Controller settings written when the FLX10 is plugged in (see
                flx10_setup.py settings --help). Writing them also unlocks the
                jog screens and the audio interface on Linux.
              '';
            };
          };

          config = lib.mkIf cfg.enable {
            environment.systemPackages = [ cfg.package setup ];
            services.udev.packages = [ cfg.package ];
            services.udev.extraRules = ''
              ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="2b73", ATTR{idProduct}=="0041", TAG+="systemd", ENV{SYSTEMD_WANTS}+="flx10-setup.service"
            '';
            systemd.services.flx10-setup = {
              description = "Pioneer DDJ-FLX10 settings and unlock";
              serviceConfig = {
                Type = "oneshot";
                ExecStart = "${setup}/bin/flx10-setup settings ${args}";
              };
            };
          };
        };
    };
}
