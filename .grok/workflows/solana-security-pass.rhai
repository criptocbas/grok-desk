let meta = #{
    name: "solana-security-pass",
    description: "Map Solana program entry points, scan critical vuln patterns, adversarially verify findings",
    when_to_use: "Security review of Anchor/native Solana programs before launch or after large instruction changes",
    phases: [
        #{ title: "Map", detail: "state-changing entry points and privileged ops" },
        #{ title: "Scan", detail: "CPI, PDA, signer, owner, sysvar patterns" },
        #{ title: "Verify", detail: "skeptic agents challenge each finding" },
    ],
};

let entry_schema = #{
    "type": "object",
    "required": ["entry_points", "notes"],
    "properties": #{
        "entry_points": #{
            "type": "array",
            "maxItems": 40,
            "items": #{
                "type": "object",
                "required": ["name", "path", "access", "state_changing"],
                "properties": #{
                    "name": #{ "type": "string" },
                    "path": #{ "type": "string" },
                    "access": #{ "type": "string" },
                    "state_changing": #{ "type": "boolean" },
                    "risk_note": #{ "type": "string" },
                },
            },
        },
        "notes": #{ "type": "string" },
    },
};

let findings_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["file", "issue", "severity", "pattern"],
                "properties": #{
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "pattern": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                },
            },
        },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let root = if args == () { () } else { args.root };
if root == () {
    root = ".";
}
if type_of(root) != "string" || root == "" {
    pause("verification", "Pass args.root as a string path (e.g. programs or .)");
}

let root_json = json_encode(root);

phase("Map");
let map_prompt = "";
map_prompt += "You are auditing a Solana program codebase. Target root: ";
map_prompt += root_json;
map_prompt += ". Use read-only tools (read_file, grep, list_dir) — do not edit files. ";
map_prompt += "Identify state-changing entry points (instructions/handlers), access level ";
map_prompt += "(public, admin, role-restricted, internal), and path. Exclude pure views. ";
map_prompt += "Prefer Anchor #[program] handlers and explicit instruction enums. ";
map_prompt += "Return at most 40 entry points. Empty list only after you searched the tree.";

let mapped = agent(map_prompt, #{
    label: "entry-map",
    capability_mode: "read-only",
    output_schema: entry_schema,
});

if mapped == () || !mapped.success || mapped.output == () {
    complete(#{
        summary: "Entry-point mapping failed; cannot continue security pass.",
        confirmed: [],
    });
}

let entry_count = 0;
if mapped.output.entry_points != () {
    entry_count = mapped.output.entry_points.len();
}
log("Mapped " + entry_count.to_string() + " entry points under " + root);

phase("Scan");
let scan_prompt = "";
scan_prompt += "Security scan of Solana programs under root ";
scan_prompt += root_json;
scan_prompt += ". Use read-only tools; read actual code. ";
scan_prompt += "Scan for: arbitrary CPI, missing signer checks, owner checks, PDA bump/seed mistakes, ";
scan_prompt += "sysvar spoofing, replay/account substitution, unsafe remaining_accounts, token account confusion. ";
scan_prompt += "Report at most 12 concrete findings with file, issue, severity (critical|high|med|low), ";
scan_prompt += "pattern name, and short evidence. Empty findings only after reading program sources. ";
scan_prompt += "Entry-point context from prior map notes: ";
if mapped.output.notes != () {
    scan_prompt += json_encode(mapped.output.notes);
}

let scanned = agent(scan_prompt, #{
    label: "vuln-scan",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

if scanned == () || !scanned.success || scanned.output == () || scanned.output.findings == () {
    complete(#{
        summary: "Scan failed or returned no usable findings list.",
        entry_points: entry_count,
        confirmed: [],
    });
}

let findings = scanned.output.findings;
if findings.len() == 0 {
    complete(#{
        summary: "No findings from scan after code review.",
        entry_points: entry_count,
        confirmed: [],
    });
}

log("Scan reported " + findings.len().to_string() + " findings; verifying…");

phase("Verify");
let vjobs = [];
for f in findings {
    let fp = "";
    fp += "Adversarially verify this Solana security finding by reading the shipped code. ";
    fp += "Finding: " + json_encode(f.issue) + " in file " + json_encode(f.file);
    fp += " (pattern " + json_encode(f.pattern) + ", severity " + json_encode(f.severity) + "). ";
    fp += "Set real=true ONLY with concrete evidence you independently inspected in-repo. ";
    fp += "Otherwise real=false. Prefer false when ambiguous.";
    vjobs.push(#{
        prompt: fp,
        label: "verify",
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
}
let verdicts = parallel(vjobs);

let confirmed = [];
let i = 0;
for v in verdicts {
    if v != () && v.success && v.output != () && v.output.real == true
        && v.output.evidence != () && v.output.evidence != "" {
        let item = findings[i];
        confirmed.push(#{
            file: item.file,
            issue: item.issue,
            severity: item.severity,
            pattern: item.pattern,
            verify_evidence: v.output.evidence,
        });
    }
    i += 1;
}

log(confirmed.len().to_string() + "/" + findings.len().to_string() + " findings survived verification");

let report = "";
report += "# Solana security pass\n\n";
report += "Root: " + root + "\n\n";
report += "Entry points mapped: " + entry_count.to_string() + "\n";
report += "Raw findings: " + findings.len().to_string() + "\n";
report += "Confirmed: " + confirmed.len().to_string() + "\n\n";
for c in confirmed {
    report += "## " + c.severity + " — " + c.file + "\n";
    report += c.issue + "\n\n";
    report += "Pattern: " + c.pattern + "\n\n";
    report += "Evidence: " + c.verify_evidence + "\n\n";
}
if confirmed.len() == 0 {
    report += "_No findings survived adversarial verification._\n";
}

let path = write_scratch_file("solana-security-pass.md", report);
complete(#{
    summary: confirmed.len().to_string() + " confirmed findings (" + findings.len().to_string() + " raw)",
    entry_points: entry_count,
    raw_findings: findings.len(),
    confirmed: confirmed,
    path: path,
});
