let meta = #{
    name: "idl-client-sync",
    description: "Check Solana program IDL artifacts vs client/SDK types and list sync steps",
    when_to_use: "After instruction or account changes; before releasing a client SDK",
    phases: [
        #{ title: "Locate", detail: "IDL and client codegen paths" },
        #{ title: "Diff", detail: "compare program interface vs client usage" },
        #{ title: "Plan", detail: "exact commands to regenerate and verify" },
    ],
};

let locate_schema = #{
    "type": "object",
    "required": ["idl_paths", "client_paths", "codegen_cmd", "notes"],
    "properties": #{
        "idl_paths": #{
            "type": "array",
            "maxItems": 20,
            "items": #{ "type": "string" },
        },
        "client_paths": #{
            "type": "array",
            "maxItems": 20,
            "items": #{ "type": "string" },
        },
        "codegen_cmd": #{ "type": "string" },
        "notes": #{ "type": "string" },
    },
};

let diff_schema = #{
    "type": "object",
    "required": ["in_sync", "mismatches"],
    "properties": #{
        "in_sync": #{ "type": "boolean" },
        "mismatches": #{
            "type": "array",
            "maxItems": 20,
            "items": #{
                "type": "object",
                "required": ["area", "detail"],
                "properties": #{
                    "area": #{ "type": "string" },
                    "detail": #{ "type": "string" },
                },
            },
        },
    },
};

let plan_schema = #{
    "type": "object",
    "required": ["steps", "verify_cmds"],
    "properties": #{
        "steps": #{
            "type": "array",
            "maxItems": 15,
            "items": #{ "type": "string" },
        },
        "verify_cmds": #{
            "type": "array",
            "maxItems": 10,
            "items": #{ "type": "string" },
        },
    },
};

let root = if args == () { () } else { args.root };
if root == () {
    root = ".";
}
if type_of(root) != "string" || root == "" {
    pause("verification", "Pass args.root as a string path");
}

let root_json = json_encode(root);

phase("Locate");
let lprompt = "";
lprompt += "Locate IDL and client SDK artifacts under ";
lprompt += root_json;
lprompt += ". Use read-only tools. Check target/idl, idls/, declarations, Codama/Anchor generated clients, ";
lprompt += "TypeScript packages, and AGENTS.md for codegen commands. ";
lprompt += "Return idl_paths, client_paths, codegen_cmd (or empty string if unknown), and notes.";

let loc = agent(lprompt, #{
    label: "locate-idl",
    capability_mode: "read-only",
    output_schema: locate_schema,
});

if loc == () || !loc.success || loc.output == () {
    complete(#{ summary: "Could not locate IDL/client paths.", in_sync: false });
}

phase("Diff");
let dprompt = "";
dprompt += "Compare program interface vs client types for root ";
dprompt += root_json;
dprompt += ". IDL paths: " + json_encode(loc.output.idl_paths) + ". ";
dprompt += "Client paths: " + json_encode(loc.output.client_paths) + ". ";
dprompt += "Use read-only tools. Look for missing instructions, account fields, arg renames, ";
dprompt += "discriminator drift, and stale committed IDL. ";
dprompt += "Set in_sync=true only if you found no concrete mismatch. List mismatches with area+detail.";

let diffed = agent(dprompt, #{
    label: "idl-diff",
    capability_mode: "read-only",
    output_schema: diff_schema,
});

let in_sync = false;
let mismatches = [];
if diffed != () && diffed.success && diffed.output != () {
    in_sync = diffed.output.in_sync == true;
    if diffed.output.mismatches != () {
        mismatches = diffed.output.mismatches;
    }
}

phase("Plan");
let pprompt = "";
pprompt += "Produce an ordered sync plan for this Solana repo. Root: " + root_json + ". ";
pprompt += "Codegen cmd hint: " + json_encode(loc.output.codegen_cmd) + ". ";
pprompt += "Notes: " + json_encode(loc.output.notes) + ". ";
pprompt += "in_sync: " + json_encode(in_sync) + ". ";
pprompt += "Mismatches: " + json_encode(mismatches) + ". ";
pprompt += "Return concrete steps (build IDL, regenerate client, typecheck) and verify_cmds. ";
pprompt += "Do not run destructive deploys. Prefer repo-documented commands.";

let planned = agent(pprompt, #{
    label: "sync-plan",
    capability_mode: "read-only",
    output_schema: plan_schema,
});

let steps = [];
let verify = [];
if planned != () && planned.success && planned.output != () {
    if planned.output.steps != () {
        steps = planned.output.steps;
    }
    if planned.output.verify_cmds != () {
        verify = planned.output.verify_cmds;
    }
}

let report = "";
report += "# IDL ↔ client sync\n\n";
report += "Root: " + root + "\n";
report += "in_sync: " + in_sync.to_string() + "\n\n";
report += "## IDL paths\n";
if loc.output.idl_paths != () {
    for p in loc.output.idl_paths {
        report += "- " + p + "\n";
    }
}
report += "\n## Client paths\n";
if loc.output.client_paths != () {
    for p in loc.output.client_paths {
        report += "- " + p + "\n";
    }
}
report += "\n## Mismatches\n";
if mismatches.len() == 0 {
    report += "_None reported._\n";
} else {
    for m in mismatches {
        report += "- **" + m.area + "**: " + m.detail + "\n";
    }
}
report += "\n## Steps\n";
for s in steps {
    report += "1. " + s + "\n";
}
report += "\n## Verify\n";
for c in verify {
    report += "- `" + c + "`\n";
}

let path = write_scratch_file("idl-client-sync.md", report);
complete(#{
    summary: if in_sync { "IDL and clients look in sync" } else { "Sync needed — see mismatches" },
    in_sync: in_sync,
    mismatches: mismatches,
    steps: steps,
    verify_cmds: verify,
    path: path,
});
