/**
 * canvas-bg.js
 * Animated wave-line canvas background.
 *
 * Usage:
 *   <script src="canvas-bg.js"></script>
 *
 * Optional config overrides (set BEFORE loading this script):
 *   <script>
 *     window.CanvasBgConfig = { lineCount: 20, opacityMax: 0.2 };
 *   </script>
 *   <script src="canvas-bg.js"></script>
 *
 * Public API (available as window.CanvasBg):
 *   CanvasBg.show()   — make the canvas visible
 *   CanvasBg.hide()   — hide the canvas
 *   CanvasBg.config   — the active config object (changes take effect on next resize)
 *
 * Config options (with defaults):
 *   lineCount: 15, baseXSpread: 600, amplitudeMin: 200, amplitudeMax: 500,
 *   frequencyMin: 0.01, frequencyMax: 0.03, lineWidth: 60,
 *   opacityMin: 0.05, opacityMax: 0.1, backgroundColor: "black",
 *   startHidden: false
 */
window.CanvasBg = (function () {
  const CONFIG = Object.assign(
    {
      lineCount: 15,
      baseXSpread: 600,
      amplitudeMin: 200,
      amplitudeMax: 500,
      frequencyMin: 0.01,
      frequencyMax: 0.03,
      lineWidth: 60,
      opacityMin: 0.05,
      opacityMax: 0.1,
      backgroundColor: "black",
      startHidden: false
    },
    window.CanvasBgConfig || {}
  );

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "0",
    pointerEvents: "none",
    opacity: CONFIG.startHidden ? "0" : "1",
    transition: "opacity 0.5s ease"
  });
  document.body.prepend(canvas);

  function liftElement(el) {
    if (el === canvas) return;
    const cs = window.getComputedStyle(el);
    if (cs.zIndex === "auto" || cs.zIndex === "" || cs.zIndex === "0") {
      if (cs.position === "static") {
        el.style.position = "relative";
      }
      el.style.zIndex = "1";
    }
  }

  // Lift existing siblings
  Array.from(document.body.children).forEach(liftElement);

  // Lift future siblings
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) liftElement(node);
      }
    }
  });
  observer.observe(document.body, { childList: true });

  const ctx = canvas.getContext("2d");
  let gradient;
  let lines = [];
  let startTime = null;

  function createGradient() {
    gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0.05, "rgba(255, 255, 255, 0.02)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.15)");
    gradient.addColorStop(0.9, "rgba(255, 255, 255, 0.02)");
    gradient.addColorStop(1, "transparent");
  }

  class Line {
    constructor() {
      this.reset();
    }

    reset() {
      this.baseX =
        canvas.width / 2 + (Math.random() - 0.5) * 2 * CONFIG.baseXSpread;
      this.amplitude =
        Math.random() * (CONFIG.amplitudeMax - CONFIG.amplitudeMin) +
        CONFIG.amplitudeMin;
      this.frequency =
        Math.random() * (CONFIG.frequencyMax - CONFIG.frequencyMin) +
        CONFIG.frequencyMin;
      this.opacity =
        Math.random() * (CONFIG.opacityMax - CONFIG.opacityMin) +
        CONFIG.opacityMin;
      // Random phase offset reproduces the original's behaviour where a large
      // elapsed value put each line at an arbitrary sin() phase from frame 1.
      this.phaseOffset = Math.random() * (1 / this.frequency);
      this.dir = 1;
    }

    draw(elapsed) {
      const t = elapsed + this.phaseOffset;
      const x =
        this.baseX +
        this.dir *
          this.amplitude *
          Math.sin(2 * Math.PI * this.frequency * t);
      ctx.globalAlpha = this.opacity;
      ctx.fillRect(
        x - CONFIG.lineWidth / 2,
        0,
        CONFIG.lineWidth * Math.sin(2 * Math.PI * this.frequency * t),
        canvas.height
      );
    }
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    startTime = null; // reset so next tick re-anchors the start time
    createGradient();
    lines = Array.from({ length: CONFIG.lineCount }, () => new Line());
  }

  function tick(timestamp) {
    if (startTime === null) startTime = timestamp;

    ctx.globalAlpha = 1;
    ctx.fillStyle = CONFIG.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const elapsed = (timestamp - startTime) / 1000;
    ctx.fillStyle = gradient;
    for (const line of lines) {
      line.draw(elapsed);
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(tick);

  return {
    show() {
      canvas.style.opacity = "1";
    },
    hide() {
      canvas.style.opacity = "0";
    },
    config: CONFIG
  };
})();
