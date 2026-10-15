import { useEffect, useRef, useState } from "react";
import { HERO_POSTER_URL, HERO_VIDEO_URL } from "../assets";

const LERP = 0.12;
const MAX_FRAMES = 90;
const MIN_FRAMES = 24;
const FRAMES_PER_SECOND = 12;
const MAX_FRAME_WIDTH = 960;
const SEEK_EPSILON = 0.04;
const END_PADDING = 0.05;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function scrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? clamp01(window.scrollY / max) : 0;
}

/** Draws `source` into `ctx` with object-fit: cover math (scale to fill, center crop). */
function drawCover(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number, cw: number, ch: number) {
  const scale = Math.max(cw / sw, ch / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(source, (cw - w) / 2, (ch - h) / 2, w, h);
}

function waitFor(el: HTMLMediaElement, event: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      el.removeEventListener(event, done);
      resolve();
    };
    el.addEventListener(event, done, { once: true });
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
}

/**
 * Pre-decodes evenly spaced frames from an offscreen copy of the video so scrubbing
 * is a cheap bitmap draw instead of a video seek.
 */
async function extractFrames(src: string, signal: AbortSignal): Promise<ImageBitmap[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  const loaded = waitFor(video, "loadeddata", signal);
  video.load();
  await loaded;

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("unknown duration");
  const count = Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.floor(duration * FRAMES_PER_SECOND)));
  const width = Math.min(video.videoWidth, MAX_FRAME_WIDTH);
  const height = Math.round((video.videoHeight / video.videoWidth) * width);

  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const sctx = scratch.getContext("2d")!;
  const frames: ImageBitmap[] = [];
  try {
    for (let i = 0; i < count; i++) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      const seeked = waitFor(video, "seeked", signal);
      video.currentTime = (i / (count - 1)) * (duration - END_PADDING);
      await seeked;
      sctx.drawImage(video, 0, 0, width, height);
      frames.push(await createImageBitmap(scratch));
    }
  } catch (e) {
    frames.forEach((f) => f.close());
    throw e;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
  return frames;
}

export function ScrollVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const [hasFrame, setHasFrame] = useState(false);
  const [framesReady, setFramesReady] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  // Frame cache: starts once the visible video has a decoded frame, after a short yield.
  useEffect(() => {
    if (!hasFrame) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      extractFrames(HERO_VIDEO_URL, ctrl.signal)
        .then((frames) => {
          if (ctrl.signal.aborted) return frames.forEach((f) => f.close());
          framesRef.current = frames;
          setFramesReady(true);
        })
        .catch((e: unknown) => {
          // The visible <video> keeps scrubbing by seeking.
          if ((e as DOMException)?.name !== "AbortError") console.warn("[ScrollVideo] frame cache unavailable:", e);
        });
    }, 300);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [hasFrame]);

  useEffect(
    () => () => {
      framesRef.current.forEach((f) => f.close());
      framesRef.current = [];
    },
    [],
  );

  // Scroll → smoothed progress → canvas draw (or video seek fallback).
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let target = scrollProgress();
    let smoothed = target;
    let lastDrawn = -1;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      lastDrawn = -1;
    };
    const onScroll = () => {
      target = scrollProgress();
    };

    const tick = () => {
      smoothed += (target - smoothed) * LERP;
      if (Math.abs(target - smoothed) < 0.0001) smoothed = target;

      const frames = framesRef.current;
      if (frames.length) {
        const index = Math.round(smoothed * (frames.length - 1));
        if (index !== lastDrawn) {
          const f = frames[index];
          drawCover(ctx, f, f.width, f.height, canvas.width, canvas.height);
          lastDrawn = index;
          canvas.dataset.frame = String(index);
        }
      } else {
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration) && video.duration > 0 && !video.seeking) {
          const t = smoothed * Math.max(0, video.duration - END_PADDING);
          if (Math.abs(video.currentTime - t) > SEEK_EPSILON) video.currentTime = t;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const showPoster = !posterFailed && !hasFrame && !framesReady;
  const showVideo = hasFrame && !framesReady;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]" aria-hidden="true" data-testid="scroll-video">
      {!posterFailed && (
        <img
          src={HERO_POSTER_URL}
          alt=""
          onError={() => setPosterFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${showPoster ? "opacity-100" : "opacity-0"}`}
        />
      )}
      <video
        ref={videoRef}
        src={HERO_VIDEO_URL}
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setHasFrame(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${showVideo ? "opacity-100" : "opacity-0"}`}
      />
      <canvas
        ref={canvasRef}
        data-ready={framesReady}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${framesReady ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
