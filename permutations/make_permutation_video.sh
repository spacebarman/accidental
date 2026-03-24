#!/usr/bin/env bash
set -euo pipefail

INPUT_DIR="${1:-permutations/jpg_random_64}"
OUTPUT_FILE="${2:-${INPUT_DIR}/permutations_25fps_64s.mp4}"
FPS="${3:-25}"
SEGMENT_FRAMES="${4:-25}"
EDGE_FADE_FRAMES="${5:-5}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg not found in PATH" >&2
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "Error: ffprobe not found in PATH" >&2
  exit 1
fi

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Error: input directory not found: $INPUT_DIR" >&2
  exit 1
fi

if (( FPS <= 0 )); then
  echo "Error: FPS must be > 0" >&2
  exit 1
fi

if (( SEGMENT_FRAMES <= 0 )); then
  echo "Error: segment frames must be > 0" >&2
  exit 1
fi

if (( EDGE_FADE_FRAMES < 0 )); then
  echo "Error: edge fade frames must be >= 0" >&2
  exit 1
fi

if (( EDGE_FADE_FRAMES * 2 > SEGMENT_FRAMES )); then
  echo "Error: edge fade frames are too large for the segment length" >&2
  exit 1
fi

SEGMENT_SECONDS="$(awk -v f="$SEGMENT_FRAMES" -v fps="$FPS" 'BEGIN { printf "%.10f", f / fps }')"
EDGE_FADE_SECONDS="$(awk -v f="$EDGE_FADE_FRAMES" -v fps="$FPS" 'BEGIN { printf "%.10f", f / fps }')"
HOLD_FRAMES=$((SEGMENT_FRAMES - (EDGE_FADE_FRAMES * 2)))

if (( HOLD_FRAMES < 0 )); then
  echo "Error: hold frames cannot be negative" >&2
  exit 1
fi

declare -a FILES=()
METADATA_FILE="$INPUT_DIR/metadata.csv"

if [[ -f "$METADATA_FILE" ]]; then
  while IFS=, read -r _index filename _rest; do
    [[ "$filename" == "filename" ]] && continue
    filename="${filename%$'\r'}"
    FILES+=("$INPUT_DIR/$filename")
  done < "$METADATA_FILE"
else
  while IFS= read -r file; do
    FILES+=("$file")
  done < <(find "$INPUT_DIR" -maxdepth 1 -type f -name 'perm_*.jpg' | sort)
fi

if (( ${#FILES[@]} == 0 )); then
  echo "Error: no source permutation JPG files found in $INPUT_DIR" >&2
  exit 1
fi

for file in "${FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Error: referenced file not found: $file" >&2
    exit 1
  fi
done

TMP_DIR="$(mktemp -d)"
FILTER_FILE="$TMP_DIR/filter_complex.txt"
trap 'rm -rf "$TMP_DIR"' EXIT

{
  last_index=$((${#FILES[@]} - 1))

  for i in "${!FILES[@]}"; do
    if (( ${#FILES[@]} == 1 )); then
      echo "[$i:v]fps=${FPS},scale=2048:2048,format=yuv420p,setpts=PTS-STARTPTS[v$i];"
    elif (( i == 0 )); then
      echo "[$i:v]fps=${FPS},scale=2048:2048,format=yuv420p,setpts=PTS-STARTPTS,split=2[m$i][l$i];"
    elif (( i == last_index )); then
      echo "[$i:v]fps=${FPS},scale=2048:2048,format=yuv420p,setpts=PTS-STARTPTS,split=2[m$i][r$i];"
    else
      echo "[$i:v]fps=${FPS},scale=2048:2048,format=yuv420p,setpts=PTS-STARTPTS,split=3[m$i][l$i][r$i];"
    fi
  done

  if (( ${#FILES[@]} == 1 )); then
    echo "[v0]trim=end_frame=${SEGMENT_FRAMES},setpts=PTS-STARTPTS[seg0];"
  else
    for i in $(seq 0 $((last_index - 1))); do
      echo "[m$i]trim=end_frame=${HOLD_FRAMES},setpts=PTS-STARTPTS[hold$i];"
      next=$((i + 1))
      echo "[l$i][r$next]blend=all_expr='A*(1-min(max(T/${EDGE_FADE_SECONDS},0),1))+B*min(max(T/${EDGE_FADE_SECONDS},0),1)',trim=end_frame=$((EDGE_FADE_FRAMES * 2)),setpts=PTS-STARTPTS[trans$i];"
      echo "[hold$i][trans$i]concat=n=2:v=1:a=0[seg$i];"
    done

    echo "[m$last_index]trim=end_frame=${SEGMENT_FRAMES},setpts=PTS-STARTPTS[seg$last_index];"
  fi

  for i in "${!FILES[@]}"; do
    printf '[seg%s]' "$i"
  done
  echo "concat=n=${#FILES[@]}:v=1:a=0[vout]"
} > "$FILTER_FILE"

mkdir -p "$(dirname "$OUTPUT_FILE")"

CMD=(ffmpeg -y -nostdin)
for file in "${FILES[@]}"; do
  CMD+=(-loop 1 -t "$SEGMENT_SECONDS" -i "$file")
done
CMD+=(
  -filter_complex_script "$FILTER_FILE"
  -map "[vout]"
  -c:v libx264
  -pix_fmt yuv420p
  -r "$FPS"
  -movflags +faststart
  "$OUTPUT_FILE"
)

"${CMD[@]}"

echo "Rendered: $OUTPUT_FILE"
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 "$OUTPUT_FILE"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 "$OUTPUT_FILE"