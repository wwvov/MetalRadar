"""
MetalRadar SCF 部署包构建脚本

用法:
    python update_zip.py [--output deploy/dist/metalradar-scf.zip]

生成包含以下内容的 ZIP 包:
- app/ (后端 Python 代码)
- scf_entry.py (SCF 入口)
- 已安装的 Python 依赖 (需 Linux 兼容的 .whl)
"""

import os
import sys
import zipfile
import shutil
import subprocess
from pathlib import Path

BACKEND_DIR = Path(__file__).parent  # backend/
OUTPUT_DIR = BACKEND_DIR.parent / "deploy" / "dist"
OUTPUT_FILE = OUTPUT_DIR / "metalradar-scf.zip"

# 不需要包含的文件/目录
EXCLUDE_PATTERNS = [
    "__pycache__",
    "*.pyc",
    ".git",
    ".gitignore",
    ".env",
    ".venv",
    "venv",
    "*.db",
    "*.db-journal",
    "*.db-wal",
    "Dockerfile",
    ".dockerignore",
    "node_modules",
    "dist",
    ".cache",
    "*.egg-info",
    "tests",
    "test_*",
]


def should_exclude(name: str) -> bool:
    """判断文件/目录是否应排除"""
    for pattern in EXCLUDE_PATTERNS:
        if pattern.startswith("*."):
            if name.endswith(pattern[1:]):
                return True
        elif pattern == name:
            return True
    return False


def install_deps_lambda(target_dir: Path):
    """安装 Python 依赖到目标目录（Linux manylinux 兼容）

    使用 requirements-scf.txt。分两步安装：
    1. 先下载 jsonpath sdist 并本地构建 wheel（PyPI 上只有 sdist 无 wheel）
    2. 再用 --platform manylinux2014_x86_64 安装全部依赖
    """
    req_file = BACKEND_DIR / "requirements-scf.txt"
    if not req_file.exists():
        print("[WARN] requirements-scf.txt not found, skipping dependency install")
        return False

    target_dir.mkdir(parents=True, exist_ok=True)

    def run_pip(args, **kwargs):
        """Run pip with utf-8 encoding (Windows GBK compatibility)."""
        return subprocess.run(
            args,
            check=True, capture_output=True,
            encoding="utf-8", errors="replace",
            **kwargs,
        )

    pip_base = [
        sys.executable, "-m", "pip", "install",
        "-t", str(target_dir),
        "--platform", "manylinux2014_x86_64",
        "--python-version", "3.10",
        "--only-binary=:all:",
    ]

    # Step 1: Install everything EXCEPT akshare with normal dep resolution
    # These all have binary wheels, so normal resolution works fine
    # jsonpath (akshare dep) is sdist-only, so we exclude akshare here
    non_akshare_pkgs = [
        "fastapi", "uvicorn[standard]", "pydantic", "pydantic-settings",
        "sqlalchemy", "httpx", "aiofiles", "openai", "python-multipart",
        "PyPDF2", "python-dotenv", "exceptiongroup",
        "numpy", "pandas",
        "beautifulsoup4", "lxml", "requests", "curl_cffi", "html5lib",
        "xlrd", "urllib3", "openpyxl", "tqdm", "aiohttp", "py_mini_racer",
    ]
    try:
        run_pip(pip_base + non_akshare_pkgs)
        print(f"  [1/3] All non-akshare packages installed ({len(os.listdir(target_dir))} items)")
    except subprocess.CalledProcessError as e:
        print(f"[WARN] Package install failed: {(e.stderr or '')[:500]}")
        return False

    # Step 2: Install jsonpath (sdist-only on PyPI, single .py file)
    import tempfile
    tmpdir = tempfile.mkdtemp()
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "download", "--no-deps", "jsonpath>=0.82",
             "-d", tmpdir],
            check=True, capture_output=True,
            encoding="utf-8", errors="replace",
        )
        import tarfile
        for f in os.listdir(tmpdir):
            if f.endswith('.tar.gz'):
                with tarfile.open(os.path.join(tmpdir, f)) as tf:
                    tf.extractall(tmpdir)
        for root, dirs, files in os.walk(tmpdir):
            for f in files:
                if f == 'jsonpath.py':
                    shutil.copy2(os.path.join(root, f), os.path.join(target_dir, f))
                    egg_src = os.path.join(root, 'jsonpath.egg-info')
                    if os.path.isdir(egg_src):
                        egg_dst = os.path.join(target_dir, 'jsonpath.egg-info')
                        if os.path.exists(egg_dst):
                            shutil.rmtree(egg_dst)
                        shutil.copytree(egg_src, egg_dst)
                    print(f"  [2/3] jsonpath module installed")
                    break
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    # Step 3: Install akshare with --no-deps (deps already installed in step 1)
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install",
             "akshare", "-t", str(target_dir), "--no-deps"],
            check=True, capture_output=True,
            encoding="utf-8", errors="replace",
        )
        print(f"  [3/3] akshare installed ({len(os.listdir(target_dir))} items)")
    except subprocess.CalledProcessError as e:
        print(f"[WARN] akshare failed: {(e.stderr or '')[:300]}")
        return False

    print(f"  [OK] All deps installed: {len(os.listdir(target_dir))} items total")
    return True


def create_zip(output_path: Path, include_deps: bool = True):
    """创建 SCF 部署 ZIP 包"""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    deps_dir = BACKEND_DIR / "_scf_deps"

    # 安装依赖
    if include_deps:
        print("[1/3] Installing SCF-compatible dependencies...")
        if deps_dir.exists():
            shutil.rmtree(deps_dir)
        install_deps_lambda(deps_dir)

    print(f"[2/3] Creating deployment package: {output_path}")

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # 添加后端代码 (app/)
        app_dir = BACKEND_DIR / "app"
        for root, dirs, files in os.walk(app_dir):
            dirs[:] = [d for d in dirs if not should_exclude(d)]
            for f in files:
                if should_exclude(f):
                    continue
                file_path = Path(root) / f
                arcname = str(file_path.relative_to(BACKEND_DIR))
                zf.write(file_path, arcname)
                print(f"  + {arcname}")

        # 添加 scf_entry.py
        entry_file = BACKEND_DIR / "scf_entry.py"
        if entry_file.exists():
            zf.write(entry_file, "scf_entry.py")
            print(f"  + scf_entry.py")

        # 添加依赖
        if include_deps and deps_dir.exists():
            for root, dirs, files in os.walk(deps_dir):
                dirs[:] = [d for d in dirs if not should_exclude(d)]
                for f in files:
                    if should_exclude(f):
                        continue
                    file_path = Path(root) / f
                    arcname = str(file_path.relative_to(deps_dir))
                    zf.write(file_path, arcname)
            print(f"  + dependencies included")

    # 清理临时依赖目录
    if deps_dir.exists():
        shutil.rmtree(deps_dir)

    # 报告大小
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n[3/3] Deployment package: {output_path} ({size_mb:.1f} MB)")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="构建 MetalRadar SCF 部署包")
    parser.add_argument("--output", default=str(OUTPUT_FILE), help="输出路径")
    parser.add_argument("--no-deps", action="store_true", help="跳过依赖安装（手动准备）")
    args = parser.parse_args()

    create_zip(Path(args.output), include_deps=not args.no_deps)


if __name__ == "__main__":
    main()
