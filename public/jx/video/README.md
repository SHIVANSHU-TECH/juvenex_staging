# Hero videos

The landing hero (`src/components/jx/landing/Hero.tsx`) scrubs two clips by
scroll position, exactly as the source design did. Drop them here:

| File         | Source in the Claude Design project | Approx. duration |
|--------------|--------------------------------------|------------------|
| `hero-a.mp4` | `uploads/video.mp4`                  | 15.04 s          |
| `hero-b.mp4` | `assets/jx-vial-video.mp4`           | 12.06 s          |

They could not be pulled through the design MCP: `get_file` truncates at
256 KiB and both clips are several MB. Export them from the design project and
copy them in — no code change is needed, the hero picks them up automatically
and falls back to the still photograph when they are absent.

Keep them H.264/MP4 with `-movflags +faststart`. Scrubbing seeks constantly, so
a short GOP matters more than bitrate:

    ffmpeg -i in.mp4 -c:v libx264 -crf 24 -g 12 -keyint_min 12 \
           -pix_fmt yuv420p -an -movflags +faststart hero-a.mp4

`-an` is deliberate: the videos are silent and muted.
