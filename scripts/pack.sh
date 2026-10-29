#!/usr/bin/env bash

pack_extension() {
    local root="$1"
    local out_dir="$2"
    local stage
    local zip_path

    stage=$(mktemp -d)
    zip_path="${out_dir}/meridian-dock@autumn.shell-extension.zip"
    mkdir -p "${out_dir}"

    git -C "${root}" archive --format=tar HEAD \
        metadata.json \
        extension.js \
        prefs.js \
        stylesheet.css \
        LICENSE \
        src \
        prefs \
        schemas \
        | tar -C "${stage}" -x

    cp "${root}/metadata.json" "${stage}/metadata.json"
    if command -v glib-compile-schemas >/dev/null 2>&1; then
        glib-compile-schemas "${stage}/schemas"
    fi

    rm -f "${zip_path}"
    (
        cd "${stage}"
        zip -qr "${zip_path}" .
    )
    rm -rf "${stage}"
}

root=$(cd "$(dirname "$0")/.." && pwd)
out_dir=${1:-"${root}/dist"}
if [[ "${out_dir}" != /* ]]; then
    out_dir="${root}/${out_dir}"
fi
pack_extension "${root}" "${out_dir}"
