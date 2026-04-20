#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import datetime as dt
import gzip
import hashlib
import io
import json
import pathlib
import tarfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

BASE_REPOSITORY = "library/nginx"
BASE_TAG = "1.27-alpine"
DEFAULT_IMAGE_NAME = "chinese-typing-test"
REGISTRY_URL = "https://registry-1.docker.io"
TOKEN_URL = "https://auth.docker.io/token"
ARCHITECTURES = ("amd64", "arm64")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build docker-load compatible archives for the typing test app "
        "without requiring a local Docker daemon."
    )
    parser.add_argument(
        "--image-name",
        default=DEFAULT_IMAGE_NAME,
        help=f"Image repository name to embed in the archive. Default: {DEFAULT_IMAGE_NAME}",
    )
    parser.add_argument(
        "--image-tag",
        default="latest",
        help="Image tag to embed in the archive. Default: latest",
    )
    parser.add_argument(
        "--output-dir",
        default="dist",
        help="Directory for generated archives. Default: dist",
    )
    parser.add_argument(
        "--base-tag",
        default=BASE_TAG,
        help=f"Base nginx tag to extend. Default: {BASE_TAG}",
    )
    return parser.parse_args()


def fetch_bytes(url: str, *, headers: dict[str, str] | None = None) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers=headers or {})

    with urllib.request.urlopen(request) as response:
        return response.read(), response.headers.get_content_type()


def fetch_json(url: str, *, headers: dict[str, str] | None = None) -> tuple[dict, str]:
    payload, content_type = fetch_bytes(url, headers=headers)
    return json.loads(payload), content_type


def get_registry_token(repository: str) -> str:
    query = urllib.parse.urlencode(
        {
            "service": "registry.docker.io",
            "scope": f"repository:{repository}:pull",
        }
    )
    token_payload, _ = fetch_json(f"{TOKEN_URL}?{query}")
    return token_payload["token"]


def registry_headers(token: str, accept: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}

    if accept:
        headers["Accept"] = accept

    return headers


def fetch_manifest_index(token: str, repository: str, reference: str) -> tuple[dict, str]:
    accept = ",".join(
        [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        ]
    )
    return fetch_json(
        f"{REGISTRY_URL}/v2/{repository}/manifests/{reference}",
        headers=registry_headers(token, accept),
    )


def select_platform_manifest(index: dict, architecture: str) -> str:
    for manifest in index.get("manifests", []):
        platform = manifest.get("platform", {})

        if platform.get("os") != "linux":
            continue

        if platform.get("architecture") != architecture:
            continue

        return manifest["digest"]

    raise RuntimeError(f"Could not find a linux/{architecture} manifest in the base image index.")


def fetch_image_manifest(token: str, repository: str, reference: str) -> dict:
    accept = ",".join(
        [
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        ]
    )
    manifest, _ = fetch_json(
        f"{REGISTRY_URL}/v2/{repository}/manifests/{reference}",
        headers=registry_headers(token, accept),
    )
    return manifest


def fetch_blob(token: str, repository: str, digest: str) -> bytes:
    payload, _ = fetch_bytes(
        f"{REGISTRY_URL}/v2/{repository}/blobs/{digest}",
        headers=registry_headers(token),
    )
    return payload


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gzip_to_tar(blob: bytes) -> bytes:
    try:
      return gzip.decompress(blob)
    except OSError as exc:
      raise RuntimeError("Encountered a non-gzip layer, which this packer does not support.") from exc


def add_bytes_file(tar: tarfile.TarFile, name: str, payload: bytes, mode: int = 0o644) -> None:
    info = tarfile.TarInfo(name=name)
    info.size = len(payload)
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = 0
    tar.addfile(info, io.BytesIO(payload))


def add_directory(tar: tarfile.TarFile, name: str) -> None:
    normalized = name.rstrip("/") + "/"
    info = tarfile.TarInfo(name=normalized)
    info.type = tarfile.DIRTYPE
    info.mode = 0o755
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = 0
    tar.addfile(info)


def build_custom_layer(project_dir: pathlib.Path) -> tuple[bytes, str]:
    files = [
        ("etc/nginx/conf.d/default.conf", project_dir / "nginx.conf"),
        ("usr/share/nginx/html/index.html", project_dir / "index.html"),
        ("usr/share/nginx/html/styles.css", project_dir / "styles.css"),
        ("usr/share/nginx/html/app.js", project_dir / "app.js"),
    ]
    buffer = io.BytesIO()

    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for directory in (
            "etc",
            "etc/nginx",
            "etc/nginx/conf.d",
            "usr",
            "usr/share",
            "usr/share/nginx",
            "usr/share/nginx/html",
        ):
            add_directory(tar, directory)

        for archive_name, source_path in files:
            add_bytes_file(tar, archive_name, source_path.read_bytes())

    layer_bytes = buffer.getvalue()
    return layer_bytes, sha256_hex(layer_bytes)


def update_config(base_config: dict, custom_diff_id: str) -> bytes:
    config = copy.deepcopy(base_config)
    config["created"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    config.setdefault("rootfs", {}).setdefault("diff_ids", []).append(f"sha256:{custom_diff_id}")
    config.setdefault("history", []).append(
        {
            "created": config["created"],
            "created_by": "COPY nginx.conf index.html styles.css app.js",
            "comment": "Added chinese typing test static site",
        }
    )

    config.setdefault("config", {})
    config["config"].setdefault("ExposedPorts", {})
    config["config"]["ExposedPorts"]["80/tcp"] = {}
    config["config"]["Healthcheck"] = {
        "Test": ["CMD-SHELL", "wget -qO- http://127.0.0.1/health >/dev/null 2>&1 || exit 1"],
        "Interval": 30_000_000_000,
        "Timeout": 3_000_000_000,
        "StartPeriod": 5_000_000_000,
        "Retries": 3,
    }

    return json.dumps(config, separators=(",", ":"), sort_keys=True).encode("utf-8")


def repositories_payload(repo_tag: str, config_digest_hex: str) -> bytes:
    repository, tag = repo_tag.split(":", 1)
    payload = {repository: {tag: config_digest_hex}}
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def layer_metadata(layer_id: str, parent_id: str | None) -> bytes:
    payload = {"id": layer_id}

    if parent_id:
        payload["parent"] = parent_id

    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def write_docker_archive(
    *,
    archive_path: pathlib.Path,
    repo_tag: str,
    image_manifest: dict,
    config_bytes: bytes,
    base_layers: list[tuple[str, bytes]],
    custom_layer: tuple[str, bytes],
) -> None:
    config_digest_hex = sha256_hex(config_bytes)
    config_name = f"{config_digest_hex}.json"

    manifest_layers: list[str] = []
    layer_ids: list[str] = []
    previous_layer_id: str | None = None

    with tarfile.open(archive_path, mode="w") as tar:
        add_bytes_file(tar, config_name, config_bytes)

        for index, (diff_id_hex, layer_bytes) in enumerate(base_layers):
            layer_id = hashlib.sha256(f"base:{index}:{diff_id_hex}".encode("utf-8")).hexdigest()
            layer_dir = f"{layer_id}"
            manifest_layers.append(f"{layer_dir}/layer.tar")
            layer_ids.append(layer_id)
            add_directory(tar, layer_dir)
            add_bytes_file(tar, f"{layer_dir}/VERSION", b"1.0\n")
            add_bytes_file(tar, f"{layer_dir}/json", layer_metadata(layer_id, previous_layer_id))
            add_bytes_file(tar, f"{layer_dir}/layer.tar", layer_bytes)
            previous_layer_id = layer_id

        custom_diff_id_hex, custom_layer_bytes = custom_layer
        custom_layer_id = hashlib.sha256(f"custom:{custom_diff_id_hex}".encode("utf-8")).hexdigest()
        custom_layer_dir = f"{custom_layer_id}"
        manifest_layers.append(f"{custom_layer_dir}/layer.tar")
        add_directory(tar, custom_layer_dir)
        add_bytes_file(tar, f"{custom_layer_dir}/VERSION", b"1.0\n")
        add_bytes_file(tar, f"{custom_layer_dir}/json", layer_metadata(custom_layer_id, previous_layer_id))
        add_bytes_file(tar, f"{custom_layer_dir}/layer.tar", custom_layer_bytes)

        manifest_payload = [
            {
                "Config": config_name,
                "RepoTags": [repo_tag],
                "Layers": manifest_layers,
            }
        ]
        add_bytes_file(
            tar,
            "manifest.json",
            json.dumps(manifest_payload, separators=(",", ":"), sort_keys=True).encode("utf-8"),
        )
        add_bytes_file(tar, "repositories", repositories_payload(repo_tag, config_digest_hex))


def create_bundle_zip(output_dir: pathlib.Path, image_name: str, image_tag: str, archives: list[pathlib.Path]) -> pathlib.Path:
    bundle_path = output_dir / f"{image_name.replace('/', '_')}-{image_tag}-docker-archives.zip"

    with zipfile.ZipFile(bundle_path, mode="w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for archive in archives:
            bundle.write(archive, arcname=archive.name)

    return bundle_path


def write_checksums(output_dir: pathlib.Path, archives: list[pathlib.Path], bundle_path: pathlib.Path) -> pathlib.Path:
    checksum_path = output_dir / "SHA256SUMS.txt"
    entries = []

    for path in [*archives, bundle_path]:
        entries.append(f"{sha256_hex(path.read_bytes())}  {path.name}")

    checksum_path.write_text("\n".join(entries) + "\n", encoding="utf-8")
    return checksum_path


def build_archive_for_architecture(
    *,
    architecture: str,
    token: str,
    repository: str,
    base_tag: str,
    image_name: str,
    image_tag: str,
    project_dir: pathlib.Path,
    output_dir: pathlib.Path,
) -> pathlib.Path:
    index, _ = fetch_manifest_index(token, repository, base_tag)
    reference = base_tag

    if index.get("manifests"):
        reference = select_platform_manifest(index, architecture)

    manifest = fetch_image_manifest(token, repository, reference)
    base_config = json.loads(fetch_blob(token, repository, manifest["config"]["digest"]))

    base_layers: list[tuple[str, bytes]] = []
    for descriptor, diff_id in zip(manifest["layers"], base_config["rootfs"]["diff_ids"], strict=True):
        compressed_blob = fetch_blob(token, repository, descriptor["digest"])
        layer_bytes = gzip_to_tar(compressed_blob)
        expected_diff_id = diff_id.split(":", 1)[1]
        actual_diff_id = sha256_hex(layer_bytes)

        if actual_diff_id != expected_diff_id:
            raise RuntimeError(
                f"Base layer diff_id mismatch for linux/{architecture}: expected {expected_diff_id}, got {actual_diff_id}"
            )

        base_layers.append((expected_diff_id, layer_bytes))

    custom_layer_bytes, custom_diff_id = build_custom_layer(project_dir)
    config_bytes = update_config(base_config, custom_diff_id)

    repo_tag = f"{image_name}:{image_tag}"
    archive_path = output_dir / f"{image_name.replace('/', '_')}-{image_tag}-linux-{architecture}.tar"
    write_docker_archive(
        archive_path=archive_path,
        repo_tag=repo_tag,
        image_manifest=manifest,
        config_bytes=config_bytes,
        base_layers=base_layers,
        custom_layer=(custom_diff_id, custom_layer_bytes),
    )

    return archive_path


def main() -> int:
    args = parse_args()
    project_dir = pathlib.Path(__file__).resolve().parent
    output_dir = (project_dir / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    token = get_registry_token(BASE_REPOSITORY)
    archives = []

    for architecture in ARCHITECTURES:
        archive = build_archive_for_architecture(
            architecture=architecture,
            token=token,
            repository=BASE_REPOSITORY,
            base_tag=args.base_tag,
            image_name=args.image_name,
            image_tag=args.image_tag,
            project_dir=project_dir,
            output_dir=output_dir,
        )
        archives.append(archive)
        print(f"Built {archive}")

    bundle_path = create_bundle_zip(output_dir, args.image_name, args.image_tag, archives)
    checksum_path = write_checksums(output_dir, archives, bundle_path)
    print(f"Built {bundle_path}")
    print(f"Wrote {checksum_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
