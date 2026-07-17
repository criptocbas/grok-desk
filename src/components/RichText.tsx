import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

type Props = {
  text: string;
  className?: string;
};

/** Render markdown-ish assistant text: headings, lists, links, code, tables-ish. */
export function RichText({ text, className = "" }: Props) {
  const blocks = splitBlocks(text);
  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

type Block =
  | { kind: "code"; lang: string; body: string }
  | { kind: "lines"; lines: string[] };

function splitBlocks(text: string): Block[] {
  const parts = text.split(/(```[\s\S]*?```)/g);
  const out: Block[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith("```")) {
      const m = p.match(/^```(\w*)\n?([\s\S]*?)```$/);
      out.push({
        kind: "code",
        lang: m?.[1] || "",
        body: m?.[2] ?? p.slice(3, -3),
      });
    } else {
      out.push({ kind: "lines", lines: p.split("\n") });
    }
  }
  return out;
}

function Block({ block }: { block: Block }) {
  if (block.kind === "code") {
    return (
      <pre className="mono overflow-x-auto rounded-md bg-black/40 px-3 py-2 text-[12px] text-[var(--tool)]">
        {block.body}
      </pre>
    );
  }

  const nodes: ReactNode[] = [];
  let i = 0;
  const lines = block.lines;

  while (i < lines.length) {
    const line = lines[i];

    // blank
    if (!line.trim()) {
      nodes.push(<div key={i} className="h-1" />);
      i++;
      continue;
    }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-3 text-base font-semibold text-white"
          : level === 2
            ? "mt-2.5 text-[15px] font-semibold text-white"
            : "mt-2 text-[13px] font-semibold text-white/95";
      nodes.push(
        <div key={i} className={cls}>
          <Inline text={h[2]} />
        </div>,
      );
      i++;
      continue;
    }

    // unordered list run
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-1 list-disc space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>
              <Inline text={it} />
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // ordered list run
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="my-1 list-decimal space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>
              <Inline text={it} />
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // table-ish: | a | b |
    if (line.trim().startsWith("|") && line.includes("|", 1)) {
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith("|") &&
        lines[i].includes("|", 1)
      ) {
        const cells = lines[i]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        // skip separator |---|
        if (!cells.every((c) => /^[-:]+$/.test(c))) {
          rows.push(cells);
        }
        i++;
      }
      if (rows.length) {
        nodes.push(
          <div key={`tbl-${i}`} className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <tbody>
                {rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={
                      ri === 0
                        ? "border-b border-[var(--border)] font-medium text-white"
                        : "border-b border-[var(--border)]/40"
                    }
                  >
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1.5 align-top">
                        <Inline text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    // normal paragraph line
    nodes.push(
      <p key={i} className="whitespace-pre-wrap">
        <Inline text={line} />
      </p>,
    );
    i++;
  }

  return <>{nodes}</>;
}

function Inline({ text }: { text: string }) {
  // bold, code, markdown links, bare urls
  const parts = text.split(
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)<>]+)/g,
  );
  return (
    <>
      {parts.map((part, j) => {
        if (!part) return null;
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={j}
              className="mono rounded bg-white/10 px-1 py-0.5 text-[12px] text-[var(--tool)]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const md = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (md) {
          return (
            <Link key={j} href={md[2]} label={md[1]} />
          );
        }
        if (/^https?:\/\//.test(part)) {
          // trim trailing punctuation
          const clean = part.replace(/[.,;:]+$/, "");
          const trail = part.slice(clean.length);
          return (
            <span key={j}>
              <Link href={clean} label={clean} />
              {trail}
            </span>
          );
        }
        return <span key={j}>{part}</span>;
      })}
    </>
  );
}

function Link({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="break-all text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2 hover:decoration-[var(--accent)]"
      onClick={(e) => {
        e.preventDefault();
        void openUrl(href).catch(() => {
          // fallback: let default if opener fails in browser-only
          window.open(href, "_blank", "noopener,noreferrer");
        });
      }}
    >
      {label}
    </a>
  );
}
