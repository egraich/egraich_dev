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

  // header gets a solid bg after scrolling past the hero top
  var header = document.querySelector('.site-header');
  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 24);
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
     4. Tilt + glare on project cards (desktop only)
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
     5. Custom cursor (high tier + fine pointer only)
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

  /* 6. Animated background: high -> three.js wave (dynamic import + FPS
     probe), medium -> 2D canvas particles, low -> static CSS gradients.
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
  function startMediumBG() {
    if (!canvas || reduced) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, parts = [];

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
    });
    showCanvas();
  }

  // -- three.js particle wave (high tier) --
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
        scene.fog = new THREE.FogExp2(0x0b0d13, 0.030);

        var camera = new THREE.PerspectiveCamera(58, 1, 0.1, 120);
        camera.position.set(0, 7.2, 21);
        camera.lookAt(0, -1, 0);

        // point grid
        var COLS = 120, ROWS = 58, GAP = 0.56;
        var N = COLS * ROWS;
        var positions = new Float32Array(N * 3);
        var colors = new Float32Array(N * 3);
        var cDeep = new THREE.Color(0x042c40);
        var cTeal = new THREE.Color(0x2691a1);
        var cAcc = new THREE.Color(0x30d0d3);
        var tmp = new THREE.Color();

        var k = 0;
        for (var r = 0; r < ROWS; r++) {
          for (var c = 0; c < COLS; c++) {
            var ix = (c - COLS / 2) * GAP;
            var iz = (r - ROWS / 2) * GAP;
            positions[k * 3] = ix;
            positions[k * 3 + 1] = 0;
            positions[k * 3 + 2] = iz;
            var depth = r / ROWS;                       // far rows -> deep blue
            var rnd = Math.random();
            if (rnd < 0.06) tmp.copy(cAcc);             // sparse bright sparks
            else tmp.copy(cTeal).lerp(cDeep, depth * 0.85);
            tmp.multiplyScalar(0.55 + rnd * 0.65);
            colors[k * 3] = tmp.r; colors[k * 3 + 1] = tmp.g; colors[k * 3 + 2] = tmp.b;
            k++;
          }
        }

        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        var mat = new THREE.PointsMaterial({
          size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        });

        var points = new THREE.Points(geo, mat);
        points.position.y = -3.4;
        scene.add(points);

        // teardown() disposes the renderer — resize/parallax listeners
        // must never touch it afterwards (the rAF loop is killed by loop.stop())
        var dead = false;

        function resize() {
          if (dead) return;
          var w = canvas.clientWidth || innerWidth;
          var h = canvas.clientHeight || innerHeight;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
        resize();
        window.addEventListener('resize', resize);

        // gentle mouse parallax
        var tx = 0, ty = 0, cx = 0, cy = 0;
        document.addEventListener('pointermove', function (e) {
          if (dead) return;
          tx = (e.clientX / innerWidth - 0.5) * 2;
          ty = (e.clientY / innerHeight - 0.5) * 2;
        }, { passive: true });

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

        var t = 0, posAttr = geo.attributes.position;
        var loop = startRafLoop(function (now, dt) {
          t += dt * 0.5; // wave speed in rad/s — same on 60Hz and 144Hz

          if (probeFrames === 0) probeStart = now;
          probeFrames++;

          for (var i = 0; i < N; i++) {
            var x = posAttr.getX(i);
            var z = posAttr.getZ(i);
            posAttr.setY(i,
              Math.sin(x * 0.30 + t * 1.4) * 0.72 +
              Math.cos(z * 0.21 + t * 0.9) * 0.55);
          }
          posAttr.needsUpdate = true;

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
