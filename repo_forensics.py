#!/usr/bin/env python3
"""Repository forensic audit tool.

Scans a repository and generates:
- repo_report.md
- repo_inventory.csv
- repo_structure.txt

Read-only with respect to repository contents (only writes report files).
"""

from __future__ import annotations

import csv
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

LARGE_FILE_THRESHOLD = 100 * 1024 * 1024  # 100 MB
IGNORED_DIRS = {".git"}
SKIP_CONTENT_DIRS = {"node_modules"}
SUSPICIOUS_TOKENS = ("test", "old", "tmp", "backup", "experimental", "experiment", "archive")
BUILD_DIR_NAMES = {"dist", "build", "out", "target", "release", "coverage", ".next", ".nuxt"}


@dataclass
class FileRecord:
    path: str
    extension: str
    size: int
    guessed_purpose: str
    category: str


def format_size(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(num_bytes)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.2f} {unit}"
        value /= 1024
    return f"{num_bytes} B"


def tokenize_parts(path: Path) -> List[str]:
    parts = [p.lower() for p in path.parts]
    stem = path.stem.lower()
    if stem and stem not in parts:
        parts.append(stem)
    return parts


def classify(path: Path) -> Tuple[str, str]:
    ext = path.suffix.lower()
    parts = tokenize_parts(path)
    name = path.name.lower()

    if "node_modules" in parts:
        return "dependency file", "dependency"

    if ext in {".toe"}:
        return "TouchDesigner project", "touchdesigner_project"

    if ext in {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}:
        return "video asset", "video_asset"

    if ext in {".md", ".rst", ".txt"}:
        return "documentation", "documentation"

    if ext in {".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".xml"}:
        return "configuration or data", "configuration"

    if ext in {".py"}:
        return "python script", "source_code"

    if ext in {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"}:
        return "javascript/typescript logic", "source_code"

    if ext in {".html", ".htm"}:
        return "webpage", "source_code"

    if ext in {".css", ".scss", ".sass", ".less"}:
        return "styling", "source_code"

    if ext in {".c", ".cc", ".cpp", ".h", ".hpp", ".rs", ".java", ".go", ".rb", ".php", ".swift", ".kt", ".sh", ".bat", ".ps1"}:
        return "source code", "source_code"

    if any(tok in parts for tok in BUILD_DIR_NAMES):
        return "build output artifact", "build_output"

    if any(tok in " ".join(parts) for tok in SUSPICIOUS_TOKENS):
        return "test or experimental artifact", "test_or_experiment"

    if name in {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "requirements.txt", "pipfile.lock"}:
        return "dependency manifest", "dependency"

    return "unknown", "unknown"


def is_suspicious_dir(path: Path) -> bool:
    lowered = str(path).lower()
    return any(token in lowered for token in SUSPICIOUS_TOKENS)


def scan_repository(root: Path) -> Tuple[List[FileRecord], Dict[str, int], List[Path], List[Path], Dict[str, int], int]:
    records: List[FileRecord] = []
    ext_counter: Counter[str] = Counter()
    large_files: List[Path] = []
    suspicious_dirs: set[Path] = set()
    dir_file_counts: Dict[str, int] = defaultdict(int)
    duplicate_name_counter: Counter[str] = Counter()
    node_modules_total_size = 0

    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = list(os.scandir(current))
        except (OSError, PermissionError):
            continue

        for entry in entries:
            entry_path = Path(entry.path)
            if entry.is_dir(follow_symlinks=False):
                name = entry.name
                if name in IGNORED_DIRS:
                    continue
                if is_suspicious_dir(entry_path.relative_to(root)):
                    suspicious_dirs.add(entry_path)
                if name in SKIP_CONTENT_DIRS:
                    node_modules_total_size += summarize_dir_size(entry_path)
                    continue
                stack.append(entry_path)
                continue

            if not entry.is_file(follow_symlinks=False):
                continue

            rel_path = entry_path.relative_to(root)
            size = entry.stat(follow_symlinks=False).st_size
            purpose, category = classify(rel_path)
            ext = rel_path.suffix.lower() or "[no_ext]"
            records.append(
                FileRecord(
                    path=str(rel_path),
                    extension=ext,
                    size=size,
                    guessed_purpose=purpose,
                    category=category,
                )
            )
            ext_counter[ext] += 1
            duplicate_name_counter[rel_path.name.lower()] += 1

            if size >= LARGE_FILE_THRESHOLD:
                large_files.append(rel_path)

            top_level = rel_path.parts[0] if rel_path.parts else "."
            dir_file_counts[top_level] += 1

    duplicate_names = {name: count for name, count in duplicate_name_counter.items() if count > 1}
    return records, ext_counter, large_files, sorted(suspicious_dirs), dir_file_counts, node_modules_total_size, duplicate_names


def summarize_dir_size(root: Path) -> int:
    total = 0
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = os.scandir(current)
        except (OSError, PermissionError):
            continue

        with entries as it:
            for entry in it:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(Path(entry.path))
                    elif entry.is_file(follow_symlinks=False):
                        total += entry.stat(follow_symlinks=False).st_size
                except (OSError, PermissionError):
                    continue
    return total


def write_inventory_csv(records: Iterable[FileRecord], out_path: Path) -> None:
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["full_path", "file_type", "file_size_bytes", "guessed_purpose", "category"])
        for rec in sorted(records, key=lambda r: r.path.lower()):
            writer.writerow([rec.path, rec.extension, rec.size, rec.guessed_purpose, rec.category])


def write_structure(root: Path, out_path: Path) -> None:
    lines = [f"{root.name}/"]

    def walk(current: Path, prefix: str = "") -> None:
        try:
            entries = sorted(
                list(os.scandir(current)),
                key=lambda e: (not e.is_dir(follow_symlinks=False), e.name.lower()),
            )
        except (OSError, PermissionError):
            return

        visible = []
        for e in entries:
            if e.name in IGNORED_DIRS:
                continue
            visible.append(e)

        for idx, entry in enumerate(visible):
            branch = "└── " if idx == len(visible) - 1 else "├── "
            is_last = idx == len(visible) - 1
            child_prefix = prefix + ("    " if is_last else "│   ")

            if entry.is_dir(follow_symlinks=False):
                if entry.name in SKIP_CONTENT_DIRS:
                    lines.append(f"{prefix}{branch}{entry.name}/ [content skipped]")
                else:
                    lines.append(f"{prefix}{branch}{entry.name}/")
                    walk(Path(entry.path), child_prefix)
            else:
                lines.append(f"{prefix}{branch}{entry.name}")

    walk(root)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def suggested_deletable_dirs(suspicious_dirs: Iterable[Path], dir_file_counts: Dict[str, int]) -> List[str]:
    candidates = set()
    for p in suspicious_dirs:
        parts = p.parts
        if not parts:
            continue
        top = parts[0]
        candidates.add(top)
    for name in dir_file_counts:
        lowered = name.lower()
        if lowered in BUILD_DIR_NAMES or any(tok in lowered for tok in SUSPICIOUS_TOKENS):
            candidates.add(name)
    return sorted(candidates)


def write_markdown_report(
    root: Path,
    records: List[FileRecord],
    ext_counter: Counter[str],
    large_files: List[Path],
    suspicious_dirs: List[Path],
    node_modules_total_size: int,
    duplicate_names: Dict[str, int],
    out_path: Path,
    deletable_dirs: List[str],
) -> None:
    total_size = sum(r.size for r in records)
    category_counter = Counter(r.category for r in records)
    largest = sorted(records, key=lambda r: r.size, reverse=True)[:25]

    touchdesigner = [r for r in records if r.category == "touchdesigner_project"]
    videos = [r for r in records if r.category == "video_asset"]

    lines = [
        "# Repository Forensics Report",
        "",
        "## Repository summary",
        f"- Root: `{root.resolve()}`",
        f"- Total files scanned (excluding `.git` and `node_modules` contents): **{len(records)}**",
        f"- Total size scanned: **{format_size(total_size)}** ({total_size} bytes)",
        f"- Skipped `node_modules` size (aggregated): **{format_size(node_modules_total_size)}** ({node_modules_total_size} bytes)",
        "",
        "## File counts by category",
    ]

    for cat, count in sorted(category_counter.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- `{cat}`: {count}")

    lines.extend(["", "## File counts by type (extension)"])
    for ext, count in ext_counter.most_common(30):
        lines.append(f"- `{ext}`: {count}")

    lines.extend(["", "## Largest files"])
    if largest:
        for rec in largest:
            marker = " ⚠️ >100MB" if rec.size >= LARGE_FILE_THRESHOLD else ""
            lines.append(f"- `{rec.path}` — {format_size(rec.size)}{marker}")
    else:
        lines.append("- None")

    lines.extend(["", "## Suspicious folders (test/old/tmp/backup/experimental)"])
    if suspicious_dirs:
        for p in suspicious_dirs:
            lines.append(f"- `{p.relative_to(root)}`")
    else:
        lines.append("- None found")

    lines.extend(["", "## TouchDesigner projects"])
    if touchdesigner:
        for rec in touchdesigner:
            lines.append(f"- `{rec.path}`")
    else:
        lines.append("- None")

    lines.extend(["", "## Video assets"])
    if videos:
        for rec in videos[:100]:
            lines.append(f"- `{rec.path}` — {format_size(rec.size)}")
        if len(videos) > 100:
            lines.append(f"- ...and {len(videos) - 100} more")
    else:
        lines.append("- None")

    lines.extend(["", "## Duplicate filenames"])
    if duplicate_names:
        for name, count in sorted(duplicate_names.items(), key=lambda x: (-x[1], x[0]))[:100]:
            lines.append(f"- `{name}` appears {count} times")
    else:
        lines.append("- No duplicate filenames found")

    lines.extend(["", "## Possible deletable directories"])
    if deletable_dirs:
        for d in deletable_dirs:
            lines.append(f"- `{d}`")
    else:
        lines.append("- None suggested by heuristics")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    root = Path.cwd()

    print("Scanning repository...")
    records, ext_counter, large_files, suspicious_dirs, dir_file_counts, node_modules_total_size, duplicate_names = scan_repository(root)

    write_inventory_csv(records, root / "repo_inventory.csv")
    write_structure(root, root / "repo_structure.txt")
    deletable_dirs = suggested_deletable_dirs(suspicious_dirs, dir_file_counts)
    write_markdown_report(
        root,
        records,
        ext_counter,
        large_files,
        suspicious_dirs,
        node_modules_total_size,
        duplicate_names,
        root / "repo_report.md",
        deletable_dirs,
    )

    video_count = sum(1 for r in records if r.category == "video_asset")
    td_count = sum(1 for r in records if r.category == "touchdesigner_project")

    print(f"Files discovered: {len(records)}")
    print(f"Video assets: {video_count}")
    print(f"TouchDesigner projects: {td_count}")
    print(f"Large files (>100MB): {len(large_files)}")
    print("\nReports written:")
    print("repo_report.md")
    print("repo_inventory.csv")
    print("repo_structure.txt")


if __name__ == "__main__":
    main()
