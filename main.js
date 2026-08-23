/* egraich.dev — main.js
   Device-aware effects: three tiers (low / medium / high).
   three.js is only ever loaded through a dynamic import on high-tier
   devices, after an FPS probe fails or succeeds — zero cost otherwise. */
(function () {
  'use strict';

  var html = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  /* ----------------------------------------------------
     1. Device tier detection
     deviceMemory is a SOFT signal only (undefined in
     Safari/Firefox); pointer type + touch points + cores
     carry the decision, then a runtime FPS probe can
     demote high -> medium.
  ---------------------------------------------------- */
  function detectTier() {
    if (reduced) return 'low';
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var touch = (navigator.maxTouchPoints || 0) > 0;
    var small = Math.min(screen.width, screen.height) < 780;
    var cores = navigator.hardwareConcurrency || 2;
    var mem = navigator.deviceMemory; // may be undefined — ignored
    if ((coarse || touch) && small) return 'low';  // phones
    if (coarse && !small) return 'medium';         // tablets
    if (cores >= 4 && (mem === undefined || mem >= 4)) return 'high';
    return 'medium';
  }

  var tier = detectTier();
  html.classList.add('tier-' + tier);

  /* ----------------------------------------------------
     2. Small utilities
  ---------------------------------------------------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // age from birthday (Oct 22, 2009), computed in the visitor's local time;
  // the HTML keeps a static fallback number for no-JS visitors and crawlers
  document.querySelectorAll('[data-age]').forEach(function (el) {
    var now = new Date();
    var age = now.getFullYear() - 2009;
    if (now < new Date(now.getFullYear(), 9, 22)) age--; // Oct 22 not reached yet
    el.textContent = age;
  });

  // remember explicit language choice (used by the auto-detect on /)
  document.querySelectorAll('[data-lang]').forEach(function (a) {
    a.addEventListener('click', function () {
      try { localStorage.setItem('lang', a.getAttribute('data-lang')); } catch (e) {}
    });
  });

  // header gets a solid bg after scrolling past the hero top;
  // the hairline progress bar mirrors reading position
  var header = document.querySelector('.site-header');
  var progress = document.querySelector('.scroll-progress');
  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 24);
    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? (window.scrollY / max).toFixed(4) : 0) + ')';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ----------------------------------------------------
     3. Scroll reveal (IntersectionObserver — cheap)
  ---------------------------------------------------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          if (en.target.hasAttribute('data-decode')) decodeText(en.target);
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // active nav link highlight
  var navLinks = document.querySelectorAll('.site-nav a');
  if ('IntersectionObserver' in window && navLinks.length) {
    var sectionIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('main section[id]').forEach(function (s) { sectionIO.observe(s); });
  }

  /* ----------------------------------------------------
     4. Text decode — [data-decode] elements "decrypt" from
        random glyphs, left to right, the first time they
        appear. Only direct text nodes are touched, so child
        elements (the section numbers) survive untouched, and
        the final text is restored bit-exact. Runs once per
        element, never under reduced motion.
  ---------------------------------------------------- */
  var GLYPHS = '!<>-_\\/[]{}—=+*^?#';

  function decodeText(el) {
    if (el.__decoded) return;
    el.__decoded = true;

    var parts = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === 3 && node.nodeValue.replace(/\s+/g, '')) {
        parts.push({ node: node, text: node.nodeValue });
      }
    }
    if (!parts.length) return;

    var len = 0;
    for (var j = 0; j < parts.length; j++) len += parts[j].text.length;

    var dur = 420 + len * 26; // longer strings decrypt longer
    var t0 = 0;

    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min((now - t0) / dur, 1);
      var solved = Math.floor(p * len);
      for (var k = 0; k < parts.length; k++) {
        var part = parts[k], out = '';
        for (var c = 0; c < part.text.length; c++) {
          var ch = part.text.charAt(c);
          out += (solved-- > 0 || ch === ' ')
            ? ch
            : GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
        }
        part.node.nodeValue = out;
      }
      if (p < 1) requestAnimationFrame(frame);
      else for (var m = 0; m < parts.length; m++) parts[m].node.nodeValue = parts[m].text;
    }
    requestAnimationFrame(frame);
  }

  // elements inside .reveal are decoded by the observer above;
  // everything else (the hero role) starts right away
  if (!reduced) {
    document.querySelectorAll('[data-decode]').forEach(function (el) {
      if (!el.classList.contains('reveal')) decodeText(el);
    });
  }

  /* ----------------------------------------------------
     5. Tilt + glare on project cards (desktop only)
  ---------------------------------------------------- */
  if (finePointer && !reduced && tier !== 'low') {
    document.querySelectorAll('.tilt').forEach(function (card) {
      var inner = card.querySelector('.tilt-inner');
      if (!inner) return;
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        inner.style.transform =
          'perspective(700px) rotateX(' + ((0.5 - py) * 7).toFixed(2) + 'deg)' +
          ' rotateY(' + ((px - 0.5) * 9).toFixed(2) + 'deg)';
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () {
        inner.style.transform = '';
      });
    });
  }

  /* ----------------------------------------------------
     6. Magnetic elements — buttons and social tiles lean
        toward the pointer and spring back on leave. The
        inline transform overrides the CSS hover-lift for the
        short moment the magnet is active; the elements' own
        transition makes the pull feel elastic.
  ---------------------------------------------------- */
  if (finePointer && !reduced && tier !== 'low') {
    document.querySelectorAll('.btn, .social-item, .lang-switch').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate3d(' +
          Math.max(-8, Math.min(8, dx * 0.22)).toFixed(1) + 'px,' +
          Math.max(-8, Math.min(8, dy * 0.28)).toFixed(1) + 'px,0)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transform = '';
      });
    });
  }

  /* ----------------------------------------------------
     7. Custom cursor (high tier + fine pointer only)
  ---------------------------------------------------- */
  if (tier === 'high' && finePointer && !reduced) {
    var dot = document.querySelector('.cursor-dot');
    var ring = document.querySelector('.cursor-ring');
    if (dot && ring) {
      html.classList.add('cursor-fx');
      var mx = -100, my = -100, rx = -100, ry = -100;

      document.addEventListener('pointermove', function (e) {
        mx = e.clientX; my = e.clientY;
        dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      }, { passive: true });

      (function loopRing() {
        rx += (mx - rx) * 0.18;
        ry += (my - ry) * 0.18;
        ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
        requestAnimationFrame(loopRing);
      })();

      document.querySelectorAll('a, button, .chip').forEach(function (el) {
        el.addEventListener('pointerenter', function () { ring.classList.add('hover'); });
        el.addEventListener('pointerleave', function () { ring.classList.remove('hover'); });
      });
    }
  }

  /* 8. Animated background: high -> three.js shader wave (dynamic
     import + FPS probe, pointer ripples), medium -> 2D canvas particles
     with sonar rings, low -> static CSS gradients.
     Shared scheduler: visibilitychange never stacks a second rAF chain
     on a live one; frame(now, dt) returning false halts the loop, and
     stop() is permanent (nothing may resurrect a disposed renderer). */
  function startRafLoop(frameFn) {
    var stopped = false, running = true, rafId = null, lastT = 0;
    function schedule() {
      if (rafId === null) rafId = requestAnimationFrame(step);
    }
    function step(now) {
      rafId = null;
      if (!running) return;
      var dt = Math.min((now - lastT) / 1000, 0.1) || 0.016;
      lastT = now;
      if (frameFn(now, dt) !== false) schedule();
    }
    document.addEventListener('visibilitychange', function () {
      if (stopped) return;
      running = !document.hidden;
      if (running) { lastT = performance.now(); schedule(); }
    });
    schedule();
    return {
      stop: function () {
        stopped = true;
        running = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }

  var canvas = document.getElementById('bg');

  function showCanvas() { if (canvas) canvas.classList.add('visible'); }

  // -- 2D fallback / medium tier --
  // drifting particles + sonar rings that follow the pointer —
  // the ring is a nod to the 802.11 beacon project
  function startMediumBG() {
    if (!canvas || reduced) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, parts = [], rings = [];

    function resize() {
      W = canvas.width = Math.floor(innerWidth * dpr);
      H = canvas.height = Math.floor(innerHeight * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    var count = Math.max(36, Math.min(85, Math.floor(innerWidth / 16)));
    for (var i = 0; i < count; i++) {
      parts.push({
        x: Math.random() * W, y: Math.random() * H,
        r: (0.6 + Math.random() * 1.8) * dpr,
        vx: (Math.random() - 0.5) * 0.12 * dpr,
        vy: -(0.05 + Math.random() * 0.16) * dpr,
        ph: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 0.8,
        bright: Math.random() < 0.25 // some particles use the bright accent
      });
    }

    // sonar rings: spawned by pointer travel (throttled by time AND
    // distance, so scrolling never floods them) and by taps; hard-capped,
    // the oldest ring is evicted first
    var lastSx = -1e4, lastSy = -1e4, lastSt = 0;
    function spawnRing(x, y, strong) {
      rings.push({
        x: x * dpr, y: y * dpr,
        r: 4 * dpr,
        v: (strong ? 190 : 110) * dpr,
        a: strong ? 0.5 : 0.3
      });
      if (rings.length > 14) rings.shift();
    }
    document.addEventListener('pointermove', function (e) {
      var now = performance.now();
      var dx = e.clientX - lastSx, dy = e.clientY - lastSy;
      if (now - lastSt < 180 || dx * dx + dy * dy < 8100) return; // 90px
      lastSx = e.clientX; lastSy = e.clientY; lastSt = now;
      spawnRing(e.clientX, e.clientY, false);
    }, { passive: true });
    document.addEventListener('pointerdown', function (e) {
      spawnRing(e.clientX, e.clientY, true);
    });

    var t = 0;
    startRafLoop(function (now, dt) {
      t += dt;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -8) { p.y = H + 8; p.x = Math.random() * W; }
        if (p.x < -8) p.x = W + 8;
        if (p.x > W + 8) p.x = -8;
        var a = 0.18 + 0.5 * Math.abs(Math.sin(t * p.sp + p.ph));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = p.bright
          ? 'rgba(48,208,211,' + a.toFixed(3) + ')'
          : 'rgba(38,145,161,' + (a * 0.6).toFixed(3) + ')';
        ctx.fill();
      }
      for (var j = rings.length - 1; j >= 0; j--) {
        var g = rings[j];
        g.r += g.v * dt;
        g.a -= dt * 0.3;
        if (g.a <= 0) { rings.splice(j, 1); continue; }
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, 6.2832);
        ctx.strokeStyle = 'rgba(48,208,211,' + g.a.toFixed(3) + ')';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();
      }
    });
    showCanvas();
  }

  // -- three.js shader wave (high tier) --
  // The swell moved from the CPU to a vertex shader, so JS no longer
  // touches ~7000 points per frame. Pointer moves and clicks feed a
  // small ring buffer of ripples that propagate through the same
  // shader — the mouse literally stirs the water.
  function startHighBG() {
    if (!canvas || reduced) return;

    import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js')
      .then(function (THREE) {
        var renderer;
        try {
          renderer = new THREE.WebGLRenderer({
            canvas: canvas, alpha: true, antialias: false,
            powerPreference: 'high-performance'
          });
        } catch (e) { startMediumBG(); return; }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        var scene = new THREE.Scene();

        var camera = new THREE.PerspectiveCamera(58, 1, 0.1, 120);
        camera.position.set(0, 7.2, 21);
        camera.lookAt(0, -1, 0);

        // static point grid — y is computed on the GPU, so the position
        // attribute never changes after setup
        var COLS = 120, ROWS = 58, GAP = 0.56;
        var N = COLS * ROWS;
        var positions = new Float32Array(N * 3);
        var colors = new Float32Array(N * 3);
        var rnds = new Float32Array(N);
        var cDeep = new THREE.Color(0x042c40);
        var cTeal = new THREE.Color(0x2691a1);
        var cAcc = new THREE.Color(0x30d0d3);
        var tmp = new THREE.Color();

        var k = 0;
        for (var r = 0; r < ROWS; r++) {
          for (var c = 0; c < COLS; c++) {
            positions[k * 3] = (c - COLS / 2) * GAP;
            positions[k * 3 + 1] = 0;
            positions[k * 3 + 2] = (r - ROWS / 2) * GAP;
            var depth = r / ROWS;                       // far rows -> deep blue
            var rnd = Math.random();
            if (rnd < 0.06) tmp.copy(cAcc);             // sparse bright sparks
            else tmp.copy(cTeal).lerp(cDeep, depth * 0.85);
            tmp.multiplyScalar(0.80 + rnd * 0.60);      // high floor: the wave must read without any ripple
            colors[k * 3] = tmp.r; colors[k * 3 + 1] = tmp.g; colors[k * 3 + 2] = tmp.b;
            rnds[k] = Math.random();                    // twinkle phase
            k++;
          }
        }

        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('aRnd', new THREE.BufferAttribute(rnds, 1));

        // ripple ring buffer: each slot is vec4(x, z, startTime, amp);
        // startTime = -10 marks an empty slot (the shader skips it)
        var RIPPLES = 8, ripHead = 0;
        var ripples = [];
        for (var q = 0; q < RIPPLES; q++) ripples.push(new THREE.Vector4(0, 0, -10, 0));

        var uniforms = {
          uTime: { value: 0 },
          uRipples: { value: ripples },
          uSize: { value: 0.18 },
          uScale: { value: 1 } // half the drawing-buffer height, set in resize()
        };

        var mat = new THREE.ShaderMaterial({
          uniforms: uniforms,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          vertexShader: `
            uniform float uTime;
            uniform vec4  uRipples[${RIPPLES}];
            uniform float uSize;
            uniform float uScale;
            attribute vec3  aColor;
            attribute float aRnd;
            varying vec3 vColor;

            void main() {
              vec3 p = position;
              float t = uTime;

              // two-axis swell — the exact formulas the old CPU loop
              // used, so the wave keeps its silhouette
              float y = sin(p.x * 0.30 + t * 1.4) * 0.72
                      + cos(p.z * 0.21 + t * 0.9) * 0.55;

              // ripples: ring waves that lose energy as they travel
              // outward and as they age; crests also glow brighter
              float glow = 0.0;
              for (int i = 0; i < ${RIPPLES}; i++) {
                vec4 rp = uRipples[i];
                float age = t - rp.z;
                if (age <= 0.0 || age > 2.6) continue;
                float d = distance(p.xz, rp.xy);
                float ring = sin(d * 2.4 - age * 7.5)
                           * exp(-d * 0.32) * exp(-age * 1.4) * rp.w;
                y += ring;
                glow += max(ring, 0.0) * 2.2;
              }
              p.y = y;

              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_Position = projectionMatrix * mv;

              // the same perspective sizing PointsMaterial would apply
              gl_PointSize = max(uSize * uScale / -mv.z, 1.0);

              // slow twinkle + accent tint on ripple crests; the exp() is
              // FogExp2 done by hand (ShaderMaterial skips the built-in
              // fog chunks, and fading to black is free under additive
              // blending)
              float twinkle = 1.0 + 0.2 * sin(t * (0.5 + aRnd) + aRnd * 6.2831);
              vColor = (aColor * twinkle + vec3(0.19, 0.82, 0.83) * glow)
                     * exp(-0.0009 * mv.z * mv.z);
            }`,
          fragmentShader: `
            varying vec3 vColor;

            void main() {
              // round sprite with a SOLID core and a soft rim — the core
              // carries the same full-alpha light the old square points did
              float d = length(gl_PointCoord - 0.5);
              gl_FragColor = vec4(vColor, 1.0 - smoothstep(0.32, 0.5, d));
            }`
        });

        var points = new THREE.Points(geo, mat);
        points.position.y = -3.4;
        scene.add(points);

        // teardown() disposes the renderer — resize/pointer handlers
        // must never touch it afterwards (the rAF loop is killed by loop.stop())
        var dead = false;

        function resize() {
          if (dead) return;
          var w = canvas.clientWidth || innerWidth;
          var h = canvas.clientHeight || innerHeight;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          uniforms.uScale.value = canvas.height * 0.5;
        }
        resize();
        window.addEventListener('resize', resize);

        // parallax target and ripples share one listener; ripples are
        // throttled by time AND distance so a fast mouse doesn't flood
        // the ring buffer
        var t = 0, tx = 0, ty = 0, cx = 0, cy = 0;
        var raycaster = new THREE.Raycaster();
        var ndc = new THREE.Vector2();
        var hit = new THREE.Vector3();
        var surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), 3.4); // points sit at y = -3.4
        var lastRx = -1e4, lastRy = -1e4, lastRt = 0;

        function addRipple(e, amp) {
          ndc.x = (e.clientX / innerWidth) * 2 - 1;
          ndc.y = -(e.clientY / innerHeight) * 2 + 1;
          raycaster.setFromCamera(ndc, camera);
          if (!raycaster.ray.intersectPlane(surface, hit)) return;
          points.worldToLocal(hit); // ripple origins live in grid space
          ripples[ripHead].set(hit.x, hit.z, t, amp);
          ripHead = (ripHead + 1) % RIPPLES;
        }

        document.addEventListener('pointermove', function (e) {
          if (dead) return;
          tx = (e.clientX / innerWidth - 0.5) * 2;
          ty = (e.clientY / innerHeight - 0.5) * 2;
          var now = performance.now();
          var dx = e.clientX - lastRx, dy = e.clientY - lastRy;
          if (now - lastRt > 150 && dx * dx + dy * dy > 4900) { // 70px
            lastRx = e.clientX; lastRy = e.clientY; lastRt = now;
            addRipple(e, 0.45);
          }
        }, { passive: true });

        document.addEventListener('pointerdown', function (e) {
          if (dead) return;
          addRipple(e, 1.3);
        });

        // pause only when the tab is hidden — the background is fixed and
        // visible through the whole page, so freezing it mid-scroll (or
        // blanking it after an F11 resize) looks broken.
        //
        // FPS probe: if the device can't hold ~50fps, fall back quietly
        var probeFrames = 0, probeStart = 0, probed = false;

        function teardown() {
          dead = true;
          loop.stop();
          geo.dispose();
          mat.dispose();
          renderer.dispose();
          canvas.classList.remove('visible');
          canvas.width = canvas.height = 0;
          startMediumBG();
        }

        var loop = startRafLoop(function (now, dt) {
          t += dt * 0.5; // wave speed in rad/s — same on 60Hz and 144Hz
          uniforms.uTime.value = t;

          if (probeFrames === 0) probeStart = now;
          probeFrames++;

          cx += (tx - cx) * 0.04;
          cy += (ty - cy) * 0.04;
          camera.position.x = cx * 1.6;
          camera.position.y = 7.2 - cy * 1.1;
          camera.lookAt(0, -1, 0);

          renderer.render(scene, camera);

          if (!probed && probeFrames >= 120) {
            probed = true;
            var fps = 1000 * 120 / (now - probeStart);
            if (fps < 50) { teardown(); return false; }
          }
        });
        showCanvas();
      })
      .catch(function () { startMediumBG(); }); // CDN unreachable -> 2D fallback
  }

  if (tier === 'high') startHighBG();
  else if (tier === 'medium') startMediumBG();
})();
