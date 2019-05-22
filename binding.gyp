{
  "targets": [
    {
      "target_name": "nroonga_bindings",
      "sources": [ "src/nroonga.cc" ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "conditions": [
        [
          'OS == "win"', {
            "include_dirs": ['win/groonga/include/groonga'],
            "library_dirs": ['win/groonga/lib'],
            "libraries": ["libgroonga"],
          }, { # OS != "win"
            "include_dirs": [
              "<!@(pkg-config --cflags-only-I groonga | sed -e 's/-I//g')",
            ],
            "ldflags": ["<!@(pkg-config --libs-only-L groonga)"],
            "libraries": ["<!@(pkg-config --libs-only-l groonga)"],
          }
        ],
        ['OS == "mac"', {
          "xcode_settings": {
            "OTHER_LDFLAGS": ["<!@(pkg-config --libs-only-L groonga)"]
          }
        }]
      ]
    }
  ]
}
