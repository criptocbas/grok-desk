let meta = #{
    name: "solana-test-matrix",
    description: "Discover how this Solana repo tests, run the primary suite, summarize gaps",
    when_to_use: "Before claiming a program change is done; map unit vs integration coverage",
    phases: [
        #{ title: "Discover", detail: "find build/test commands and harnesses" },
        #{ title: "Run", detail: "execute primary test command" },
        #{ title: "Gaps", detail: "recommend missing unit/integration coverage" },
    ],
};

let discover_schema = #{
    "type": "object",
    "required": ["primary_test_cmd", "build_cmd", "harnesses", "notes"],
    "properties": #{
        "primary_test_cmd": #{ "type": "string" },
        "build_cmd": #{ "type": "string" },
        "harnesses": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["name", "kind", "command"],
                "properties": #{
                    "name": #{ "type": "string" },
                    "kind": #{ "type": "string" },
                    "command": #{ "type": "string" },
                },
            },
        },
        "notes": #{ "type": "string" },
    },
};

let run_schema = #{
    "type": "object",
    "required": ["command", "exit_ok", "summary"],
    "properties": #{
        "command": #{ "type": "string" },
        "exit_ok": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "failed_tests": #{
            "type": "array",
            "maxItems": 20,
            "items": #{ "type": "string" },
        },
    },
};

let gaps_schema = #{
    "type": "object",
    "required": ["gaps", "next_commands"],
    "properties": #{
        "gaps": #{
            "type": "array",
            "maxItems": 10,
            "items": #{ "type": "string" },
        },
        "next_commands": #{
            "type": "array",
            "maxItems": 8,
            "items": #{ "type": "string" },
        },
    },
};

let root = if args == () { () } else { args.root };
if root == () {
    root = ".";
}
if type_of(root) != "string" || root == "" {
    pause("verification", "Pass args.root as a string path (repo or programs dir)");
}

let root_json = json_encode(root);

phase("Discover");
let dprompt = "";
dprompt += "Inspect Solana project at ";
dprompt += root_json;
dprompt += ". Use read-only tools (read_file, grep, list_dir). ";
dprompt += "Read AGENTS.md, Anchor.toml, package.json, Cargo.toml, and test dirs. ";
dprompt += "Determine primary_test_cmd (single shell command from repo root), build_cmd, ";
dprompt += "and harnesses (kind: unit|integration|sbf|ts|other). ";
dprompt += "Prefer documented project commands over guessing. ";
dprompt += "If unclear, set primary_test_cmd to the best candidate and explain in notes.";

let disc = agent(dprompt, #{
    label: "discover-tests",
    capability_mode: "read-only",
    output_schema: discover_schema,
});

if disc == () || !disc.success || disc.output == () {
    complete(#{ summary: "Could not discover test commands.", ok: false });
}

let primary = disc.output.primary_test_cmd;
if primary == () || primary == "" {
    complete(#{
        summary: "No primary_test_cmd discovered.",
        ok: false,
        notes: disc.output.notes,
    });
}

log("Primary test: " + primary);

phase("Run");
let rprompt = "";
rprompt += "From the project root (or ";
rprompt += root_json;
rprompt += "), run this primary test command exactly if safe: ";
rprompt += json_encode(primary);
rprompt += ". Use the terminal/shell tool. Do not deploy to mainnet. ";
rprompt += "Do not use production keypairs. Prefer existing local/dev test setup. ";
rprompt += "If the command is destructive or unclear, do not run it; set exit_ok=false and explain. ";
rprompt += "Return command used, exit_ok, summary of results, and failed test names if any.";

let ran = agent(rprompt, #{
    label: "run-tests",
    capability_mode: "execute",
    output_schema: run_schema,
});

let exit_ok = false;
let run_summary = "run step failed";
let failed = [];
let used_cmd = primary;
if ran != () && ran.success && ran.output != () {
    exit_ok = ran.output.exit_ok == true;
    if ran.output.summary != () {
        run_summary = ran.output.summary;
    }
    if ran.output.command != () && ran.output.command != "" {
        used_cmd = ran.output.command;
    }
    if ran.output.failed_tests != () {
        failed = ran.output.failed_tests;
    }
}

log("Tests exit_ok=" + exit_ok.to_string());

phase("Gaps");
let gprompt = "";
gprompt += "Based on discovery and test run, recommend coverage gaps for this Solana repo. ";
gprompt += "Root: " + root_json + ". ";
gprompt += "Discovery notes: " + json_encode(disc.output.notes) + ". ";
gprompt += "Harnesses: " + json_encode(disc.output.harnesses) + ". ";
gprompt += "Run summary: " + json_encode(run_summary) + ". ";
gprompt += "exit_ok: " + json_encode(exit_ok) + ". ";
gprompt += "Use read-only tools if you need to confirm missing LiteSVM/Mollusk/Surfpool/anchor test layers. ";
gprompt += "Return at most 10 concrete gaps and up to 8 next_commands the human/agent should run later.";

let gaps = agent(gprompt, #{
    label: "coverage-gaps",
    capability_mode: "read-only",
    output_schema: gaps_schema,
});

let gap_list = [];
let next_cmds = [];
if gaps != () && gaps.success && gaps.output != () {
    if gaps.output.gaps != () {
        gap_list = gaps.output.gaps;
    }
    if gaps.output.next_commands != () {
        next_cmds = gaps.output.next_commands;
    }
}

let report = "";
report += "# Solana test matrix\n\n";
report += "Root: " + root + "\n\n";
report += "## Commands\n";
report += "- Build: " + disc.output.build_cmd + "\n";
report += "- Primary test: " + used_cmd + "\n";
report += "- exit_ok: " + exit_ok.to_string() + "\n\n";
report += "## Run summary\n" + run_summary + "\n\n";
if failed.len() > 0 {
    report += "## Failed tests\n";
    for t in failed {
        report += "- " + t + "\n";
    }
    report += "\n";
}
report += "## Gaps\n";
for g in gap_list {
    report += "- " + g + "\n";
}
report += "\n## Next commands\n";
for c in next_cmds {
    report += "- `" + c + "`\n";
}

let path = write_scratch_file("solana-test-matrix.md", report);
complete(#{
    summary: if exit_ok { "Tests OK" } else { "Tests failed or incomplete" },
    ok: exit_ok,
    command: used_cmd,
    gaps: gap_list,
    next_commands: next_cmds,
    path: path,
});
