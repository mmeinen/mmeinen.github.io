(module
  ;; Imports: WASM has no transcendentals
  (import "env" "sin"  (func $sin  (param f32) (result f32)))
  (import "env" "cos"  (func $cos  (param f32) (result f32)))
  (import "env" "sqrt" (func $sqrt (param f32) (result f32)))

  (memory (export "memory") 1)

  ;; ===== Memory Layout (all f32 little-endian) =====
  ;; -- Inputs (JS writes) --
  ;; 0x000 camAzimuth  0x004 camElev  0x008 camDist  0x00C spin
  ;; 0x010 time  0x014 mouseX  0x018 mouseY
  ;; 0x01C baseWidth  0x020 baseHeight  0x024 renderScale  0x028 lastFrameTime(ms)
  ;;
  ;; -- Outputs (JS reads) --
  ;; 0x030 camPosX  0x034 camPosY  0x038 camPosZ
  ;; 0x03C fwdX  0x040 fwdY  0x044 fwdZ
  ;; 0x048 rightX  0x04C rightY(=0)  0x050 rightZ
  ;; 0x054 upX  0x058 upY  0x05C upZ
  ;; 0x060 rH(f32)  0x064 rIsco(f32)
  ;; 0x068 hoveredPlanet(i32)  0x06C renderScale(f32 output)
  ;;
  ;; -- Planet world positions (6 × 3 floats) --
  ;; 0x070 p0x 0x074 p0y 0x078 p0z
  ;; 0x07C p1x 0x080 p1y 0x084 p1z
  ;; 0x088 p2x 0x08C p2y 0x090 p2z
  ;; 0x094 p3x 0x098 p3y 0x09C p3z
  ;; 0x0A0 p4x 0x0A4 p4y 0x0A8 p4z
  ;; 0x0AC p5x 0x0B0 p5y 0x0B4 p5z
  ;;
  ;; -- Planet screen positions (6 × 3 floats: sx, sy, depth) --
  ;; 0x0B8 p0_sx 0x0BC p0_sy 0x0C0 p0_depth
  ;; 0x0C4 p1_sx ...
  ;; 0x0D0 p2_sx ...
  ;; 0x0DC p3_sx ...
  ;; 0x0E8 p4_sx ...
  ;; 0x0F4 p5_sx ...
  ;;
  ;; -- Planet orbital data (6 × 4 floats: oR, ph, sp, radius) --
  ;; 0x100 planet0 oR,ph,sp,radius
  ;; 0x110 planet1 ...
  ;; 0x120 planet2 ...
  ;; 0x130 planet3 ...
  ;; 0x140 planet4 ...
  ;; 0x150 planet5 ...

  ;; ===== Helper: cbrt via Newton's method =====
  (func $cbrt (param $x f32) (result f32)
    (local $g f32)
    (local $i i32)
    ;; Handle negative and zero
    (if (f32.le (local.get $x) (f32.const 0))
      (then
        (if (f32.eq (local.get $x) (f32.const 0))
          (then (return (f32.const 0)))
        )
        ;; cbrt(-x) = -cbrt(x)
        (return (f32.neg (call $cbrt (f32.neg (local.get $x)))))
      )
    )
    ;; Initial guess: x^(1/3) ≈ x^0.5^0.667 ≈ sqrt(x) * 0.7
    (local.set $g (f32.mul (call $sqrt (local.get $x)) (f32.const 0.7)))
    ;; 4 Newton iterations: g = g - (g³ - x) / (3g²) = (2g + x/g²) / 3
    (local.set $i (i32.const 0))
    (block $done
      (loop $iter
        (br_if $done (i32.ge_u (local.get $i) (i32.const 4)))
        (local.set $g
          (f32.div
            (f32.add
              (f32.mul (f32.const 2) (local.get $g))
              (f32.div (local.get $x) (f32.mul (local.get $g) (local.get $g)))
            )
            (f32.const 3)
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $iter)
      )
    )
    (local.get $g)
  )

  ;; ===== Get planet world position =====
  ;; Reads orbital data from 0x100 + idx*16, returns via globals
  (global $gx (mut f32) (f32.const 0))
  (global $gy (mut f32) (f32.const 0))
  (global $gz (mut f32) (f32.const 0))

  (func $getPlanetPos (param $idx i32)
    (local $base i32)
    (local $oR f32) (local $ph f32) (local $sp f32)
    (local $ang f32)
    (local.set $base (i32.add (i32.const 0x100) (i32.mul (local.get $idx) (i32.const 16))))
    (local.set $oR (f32.load (local.get $base)))
    (local.set $ph (f32.load offset=4 (local.get $base)))
    (local.set $sp (f32.load offset=8 (local.get $base)))
    (local.set $ang (f32.add (local.get $ph) (f32.mul (f32.load (i32.const 0x010)) (local.get $sp))))
    (global.set $gx (f32.mul (call $cos (local.get $ang)) (local.get $oR)))
    (global.set $gy (f32.const 0))
    (global.set $gz (f32.mul (call $sin (local.get $ang)) (local.get $oR)))
  )

  ;; ===== Project world to screen =====
  ;; Uses camera vectors from output memory, returns via globals $gx $gy $gz (sx, sy, depth)
  (func $projectToScreen (param $wx f32) (param $wy f32) (param $wz f32)
    (local $dx f32) (local $dy f32) (local $dz f32)
    (local $depth f32) (local $rx f32) (local $ux f32)
    (local $minDim f32) (local $W f32) (local $H f32)
    (local.set $W (f32.load (i32.const 0x01C)))
    (local.set $H (f32.load (i32.const 0x020)))
    (local.set $dx (f32.sub (local.get $wx) (f32.load (i32.const 0x030))))
    (local.set $dy (f32.sub (local.get $wy) (f32.load (i32.const 0x034))))
    (local.set $dz (f32.sub (local.get $wz) (f32.load (i32.const 0x038))))
    ;; depth = dot(d, fwd)
    (local.set $depth
      (f32.add (f32.add
        (f32.mul (local.get $dx) (f32.load (i32.const 0x03C)))
        (f32.mul (local.get $dy) (f32.load (i32.const 0x040))))
        (f32.mul (local.get $dz) (f32.load (i32.const 0x044)))
      )
    )
    (if (f32.le (local.get $depth) (f32.const 0))
      (then
        (global.set $gx (f32.const -9999))
        (global.set $gy (f32.const -9999))
        (global.set $gz (f32.const -1))
        (return)
      )
    )
    ;; rx = dot(d, right)
    (local.set $rx
      (f32.add (f32.add
        (f32.mul (local.get $dx) (f32.load (i32.const 0x048)))
        (f32.mul (local.get $dy) (f32.load (i32.const 0x04C))))
        (f32.mul (local.get $dz) (f32.load (i32.const 0x050)))
      )
    )
    ;; ux = dot(d, up)
    (local.set $ux
      (f32.add (f32.add
        (f32.mul (local.get $dx) (f32.load (i32.const 0x054)))
        (f32.mul (local.get $dy) (f32.load (i32.const 0x058))))
        (f32.mul (local.get $dz) (f32.load (i32.const 0x05C)))
      )
    )
    (local.set $minDim (f32.min (local.get $W) (local.get $H)))
    ;; focal = 1.8
    (global.set $gx (f32.add
      (f32.mul (local.get $W) (f32.const 0.5))
      (f32.mul (f32.div (local.get $rx) (local.get $depth)) (f32.mul (f32.const 1.8) (local.get $minDim)))
    ))
    (global.set $gy (f32.sub
      (f32.mul (local.get $H) (f32.const 0.5))
      (f32.mul (f32.div (local.get $ux) (local.get $depth)) (f32.mul (f32.const 1.8) (local.get $minDim)))
    ))
    (global.set $gz (local.get $depth))
  )

  ;; ===== Gravitational acceleration (Kerr metric) =====
  ;; Returns via globals $gx $gy $gz
  (func $lensAccel (param $px f32) (param $py f32) (param $pz f32)
                   (param $vx f32) (param $vy f32) (param $vz f32)
                   (param $h2 f32) (param $a f32)
    (local $r f32) (local $r2 f32) (local $r3 f32) (local $r5 f32) (local $f f32)
    (local $ax f32) (local $ay f32) (local $az f32)
    (local $rhat_x f32) (local $rhat_y f32) (local $rhat_z f32)
    (local $jDotR f32)
    (local $oLT_x f32) (local $oLT_y f32) (local $oLT_z f32)
    (local.set $r (call $sqrt (f32.add (f32.add
      (f32.mul (local.get $px) (local.get $px))
      (f32.mul (local.get $py) (local.get $py)))
      (f32.mul (local.get $pz) (local.get $pz))
    )))
    (local.set $r2 (f32.mul (local.get $r) (local.get $r)))
    (local.set $r3 (f32.mul (local.get $r2) (local.get $r)))
    (local.set $r5 (f32.mul (local.get $r2) (local.get $r3)))
    (local.set $f (f32.div (f32.mul (f32.const -1.5) (local.get $h2)) (local.get $r5)))
    (local.set $ax (f32.mul (local.get $f) (local.get $px)))
    (local.set $ay (f32.mul (local.get $f) (local.get $py)))
    (local.set $az (f32.mul (local.get $f) (local.get $pz)))
    ;; If |a| < 0.001, skip Lense-Thirring
    (if (f32.lt (f32.abs (local.get $a)) (f32.const 0.001))
      (then
        (global.set $gx (local.get $ax))
        (global.set $gy (local.get $ay))
        (global.set $gz (local.get $az))
        (return)
      )
    )
    ;; Lense-Thirring: J = (0, a, 0)
    (local.set $rhat_x (f32.div (local.get $px) (local.get $r)))
    (local.set $rhat_y (f32.div (local.get $py) (local.get $r)))
    (local.set $rhat_z (f32.div (local.get $pz) (local.get $r)))
    (local.set $jDotR (f32.mul (local.get $a) (local.get $rhat_y)))
    (local.set $oLT_x (f32.div (f32.mul (f32.const -6) (f32.mul (local.get $jDotR) (local.get $rhat_x))) (local.get $r3)))
    (local.set $oLT_y (f32.div (f32.sub (f32.mul (f32.const 2) (local.get $a)) (f32.mul (f32.const 6) (f32.mul (local.get $jDotR) (local.get $rhat_y)))) (local.get $r3)))
    (local.set $oLT_z (f32.div (f32.mul (f32.const -6) (f32.mul (local.get $jDotR) (local.get $rhat_z))) (local.get $r3)))
    ;; acc += 2 * cross(omega_LT, v)
    (local.set $ax (f32.add (local.get $ax) (f32.mul (f32.const 2)
      (f32.sub (f32.mul (local.get $oLT_y) (local.get $vz)) (f32.mul (local.get $oLT_z) (local.get $vy))))))
    (local.set $ay (f32.add (local.get $ay) (f32.mul (f32.const 2)
      (f32.sub (f32.mul (local.get $oLT_z) (local.get $vx)) (f32.mul (local.get $oLT_x) (local.get $vz))))))
    (local.set $az (f32.add (local.get $az) (f32.mul (f32.const 2)
      (f32.sub (f32.mul (local.get $oLT_x) (local.get $vy)) (f32.mul (local.get $oLT_y) (local.get $vx))))))
    (global.set $gx (local.get $ax))
    (global.set $gy (local.get $ay))
    (global.set $gz (local.get $az))
  )

  ;; ===== Trace lensed ray — 100-iteration Verlet =====
  ;; Returns planet index hit or -1
  (func $traceLensedRay (param $ox f32) (param $oy f32) (param $oz f32)
                        (param $dx f32) (param $dy f32) (param $dz f32)
                        (param $rH_val f32) (param $spinVal f32)
                        (result i32)
    (local $px f32) (local $py f32) (local $pz f32)
    (local $vx f32) (local $vy f32) (local $vz f32)
    (local $ax f32) (local $ay f32) (local $az f32)
    (local $Lx f32) (local $Ly f32) (local $Lz f32) (local $L2 f32)
    (local $i i32) (local $r f32) (local $dt f32)
    (local $ppx f32) (local $ppy f32) (local $ppz f32)
    (local $nax f32) (local $nay f32) (local $naz f32)
    (local $rNew f32) (local $p i32)
    (local $sx f32) (local $sy f32) (local $sz f32) (local $sL2 f32)
    (local $pcx f32) (local $pcy f32) (local $pcz f32) (local $pr f32)
    (local $ocx f32) (local $ocy f32) (local $ocz f32)
    (local $bH f32) (local $tC f32)
    (local $cx f32) (local $cy f32) (local $cz f32)
    (local $pbase i32)
    (local.set $px (local.get $ox))
    (local.set $py (local.get $oy))
    (local.set $pz (local.get $oz))
    (local.set $vx (local.get $dx))
    (local.set $vy (local.get $dy))
    (local.set $vz (local.get $dz))
    ;; L = cross(pos, vel)
    (local.set $Lx (f32.sub (f32.mul (local.get $py) (local.get $vz)) (f32.mul (local.get $pz) (local.get $vy))))
    (local.set $Ly (f32.sub (f32.mul (local.get $pz) (local.get $vx)) (f32.mul (local.get $px) (local.get $vz))))
    (local.set $Lz (f32.sub (f32.mul (local.get $px) (local.get $vy)) (f32.mul (local.get $py) (local.get $vx))))
    (local.set $L2 (f32.add (f32.add
      (f32.mul (local.get $Lx) (local.get $Lx))
      (f32.mul (local.get $Ly) (local.get $Ly)))
      (f32.mul (local.get $Lz) (local.get $Lz))
    ))
    ;; Initial acceleration
    (call $lensAccel (local.get $px) (local.get $py) (local.get $pz)
                     (local.get $vx) (local.get $vy) (local.get $vz)
                     (local.get $L2) (local.get $spinVal))
    (local.set $ax (global.get $gx))
    (local.set $ay (global.get $gy))
    (local.set $az (global.get $gz))
    ;; 100 iterations
    (local.set $i (i32.const 0))
    (block $exit
      (loop $iter
        (br_if $exit (i32.ge_u (local.get $i) (i32.const 100)))
        (local.set $r (call $sqrt (f32.add (f32.add
          (f32.mul (local.get $px) (local.get $px))
          (f32.mul (local.get $py) (local.get $py)))
          (f32.mul (local.get $pz) (local.get $pz))
        )))
        ;; if r < rH * 1.01, captured
        (br_if $exit (f32.lt (local.get $r) (f32.mul (local.get $rH_val) (f32.const 1.01))))
        ;; if r > 55 && dot(pos,vel) > 0, escaped
        (if (f32.gt (local.get $r) (f32.const 55))
          (then
            (if (f32.gt
              (f32.add (f32.add
                (f32.mul (local.get $px) (local.get $vx))
                (f32.mul (local.get $py) (local.get $vy)))
                (f32.mul (local.get $pz) (local.get $vz))
              ) (f32.const 0))
              (then (br $exit))
            )
          )
        )
        ;; dt = max(0.002, min(0.08*(r-rH), 5.0))
        (local.set $dt (f32.max (f32.const 0.002)
          (f32.min (f32.mul (f32.const 0.08) (f32.sub (local.get $r) (local.get $rH_val))) (f32.const 5))))
        ;; Save previous position
        (local.set $ppx (local.get $px))
        (local.set $ppy (local.get $py))
        (local.set $ppz (local.get $pz))
        ;; Verlet: pos += vel*dt + 0.5*acc*dt²
        (local.set $px (f32.add (local.get $px) (f32.add
          (f32.mul (local.get $vx) (local.get $dt))
          (f32.mul (f32.const 0.5) (f32.mul (local.get $ax) (f32.mul (local.get $dt) (local.get $dt)))))))
        (local.set $py (f32.add (local.get $py) (f32.add
          (f32.mul (local.get $vy) (local.get $dt))
          (f32.mul (f32.const 0.5) (f32.mul (local.get $ay) (f32.mul (local.get $dt) (local.get $dt)))))))
        (local.set $pz (f32.add (local.get $pz) (f32.add
          (f32.mul (local.get $vz) (local.get $dt))
          (f32.mul (f32.const 0.5) (f32.mul (local.get $az) (f32.mul (local.get $dt) (local.get $dt)))))))
        ;; New acceleration
        (call $lensAccel (local.get $px) (local.get $py) (local.get $pz)
                         (local.get $vx) (local.get $vy) (local.get $vz)
                         (local.get $L2) (local.get $spinVal))
        (local.set $nax (global.get $gx))
        (local.set $nay (global.get $gy))
        (local.set $naz (global.get $gz))
        ;; vel += 0.5*(acc+newAcc)*dt
        (local.set $vx (f32.add (local.get $vx) (f32.mul (f32.const 0.5) (f32.mul (f32.add (local.get $ax) (local.get $nax)) (local.get $dt)))))
        (local.set $vy (f32.add (local.get $vy) (f32.mul (f32.const 0.5) (f32.mul (f32.add (local.get $ay) (local.get $nay)) (local.get $dt)))))
        (local.set $vz (f32.add (local.get $vz) (f32.mul (f32.const 0.5) (f32.mul (f32.add (local.get $az) (local.get $naz)) (local.get $dt)))))
        (local.set $ax (local.get $nax))
        (local.set $ay (local.get $nay))
        (local.set $az (local.get $naz))
        ;; Check planet intersections if r in (16, 51)
        (local.set $rNew (call $sqrt (f32.add (f32.add
          (f32.mul (local.get $px) (local.get $px))
          (f32.mul (local.get $py) (local.get $py)))
          (f32.mul (local.get $pz) (local.get $pz))
        )))
        (if (i32.and
              (f32.gt (local.get $rNew) (f32.const 16))
              (f32.lt (local.get $rNew) (f32.const 51)))
          (then
            (local.set $sx (f32.sub (local.get $px) (local.get $ppx)))
            (local.set $sy (f32.sub (local.get $py) (local.get $ppy)))
            (local.set $sz (f32.sub (local.get $pz) (local.get $ppz)))
            (local.set $sL2 (f32.add (f32.add
              (f32.mul (local.get $sx) (local.get $sx))
              (f32.mul (local.get $sy) (local.get $sy)))
              (f32.mul (local.get $sz) (local.get $sz))
            ))
            (local.set $p (i32.const 0))
            (block $pDone
              (loop $pLoop
                (br_if $pDone (i32.ge_u (local.get $p) (i32.const 6)))
                ;; Read planet world pos from 0x070 + p*12
                (local.set $pbase (i32.add (i32.const 0x070) (i32.mul (local.get $p) (i32.const 12))))
                (local.set $pcx (f32.load (local.get $pbase)))
                (local.set $pcy (f32.load offset=4 (local.get $pbase)))
                (local.set $pcz (f32.load offset=8 (local.get $pbase)))
                ;; Read radius from orbital data 0x100 + p*16 + 12
                (local.set $pr (f32.load (i32.add (i32.const 0x10C) (i32.mul (local.get $p) (i32.const 16)))))
                ;; oc = prevPos - planetCenter
                (local.set $ocx (f32.sub (local.get $ppx) (local.get $pcx)))
                (local.set $ocy (f32.sub (local.get $ppy) (local.get $pcy)))
                (local.set $ocz (f32.sub (local.get $ppz) (local.get $pcz)))
                ;; bH = dot(oc, seg)
                (local.set $bH (f32.add (f32.add
                  (f32.mul (local.get $ocx) (local.get $sx))
                  (f32.mul (local.get $ocy) (local.get $sy)))
                  (f32.mul (local.get $ocz) (local.get $sz))
                ))
                ;; tC = clamp(-bH/sL2, 0, 1)
                (local.set $tC (f32.max (f32.const 0)
                  (f32.min (f32.div (f32.neg (local.get $bH)) (local.get $sL2)) (f32.const 1))))
                ;; closest = oc + seg*tC
                (local.set $cx (f32.add (local.get $ocx) (f32.mul (local.get $sx) (local.get $tC))))
                (local.set $cy (f32.add (local.get $ocy) (f32.mul (local.get $sy) (local.get $tC))))
                (local.set $cz (f32.add (local.get $ocz) (f32.mul (local.get $sz) (local.get $tC))))
                ;; if dist² < radius², hit
                (if (f32.lt
                  (f32.add (f32.add
                    (f32.mul (local.get $cx) (local.get $cx))
                    (f32.mul (local.get $cy) (local.get $cy)))
                    (f32.mul (local.get $cz) (local.get $cz))
                  )
                  (f32.mul (local.get $pr) (local.get $pr)))
                  (then (return (local.get $p)))
                )
                (local.set $p (i32.add (local.get $p) (i32.const 1)))
                (br $pLoop)
              )
            )
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $iter)
      )
    )
    (i32.const -1)
  )

  ;; ===== Check hover: ray-sphere + lensed fallback =====
  (func $checkHover (param $mx f32) (param $my f32) (result i32)
    (local $W f32) (local $H f32) (local $minDim f32)
    (local $ndcX f32) (local $ndcY f32)
    (local $fwdX f32) (local $fwdY f32) (local $fwdZ f32)
    (local $rX f32) (local $rZ f32) (local $upX f32) (local $upY f32) (local $upZ f32)
    (local $rdx f32) (local $rdy f32) (local $rdz f32) (local $rdLen f32)
    (local $rx f32) (local $ry f32) (local $rz f32)
    (local $cpx f32) (local $cpy f32) (local $cpz f32)
    (local $bestIdx i32) (local $bestT f32)
    (local $i i32)
    (local $pcx f32) (local $pcy f32) (local $pcz f32) (local $pr f32)
    (local $ocx f32) (local $ocy f32) (local $ocz f32)
    (local $b f32) (local $c f32) (local $disc f32) (local $t f32)
    (local $pbase i32)
    (local $rH_val f32) (local $spinVal f32)
    ;; Read camera data
    (local.set $cpx (f32.load (i32.const 0x030)))
    (local.set $cpy (f32.load (i32.const 0x034)))
    (local.set $cpz (f32.load (i32.const 0x038)))
    (local.set $fwdX (f32.load (i32.const 0x03C)))
    (local.set $fwdY (f32.load (i32.const 0x040)))
    (local.set $fwdZ (f32.load (i32.const 0x044)))
    (local.set $rX (f32.load (i32.const 0x048)))
    (local.set $rZ (f32.load (i32.const 0x050)))
    (local.set $upX (f32.load (i32.const 0x054)))
    (local.set $upY (f32.load (i32.const 0x058)))
    (local.set $upZ (f32.load (i32.const 0x05C)))
    (local.set $W (f32.load (i32.const 0x01C)))
    (local.set $H (f32.load (i32.const 0x020)))
    (local.set $rH_val (f32.load (i32.const 0x060)))
    (local.set $spinVal (f32.load (i32.const 0x00C)))
    (local.set $minDim (f32.min (local.get $W) (local.get $H)))
    ;; Screen to NDC
    (local.set $ndcX (f32.div (f32.sub (local.get $mx) (f32.mul (local.get $W) (f32.const 0.5)))
      (f32.mul (f32.const 1.8) (local.get $minDim))))
    (local.set $ndcY (f32.div (f32.sub (f32.mul (local.get $H) (f32.const 0.5)) (local.get $my))
      (f32.mul (f32.const 1.8) (local.get $minDim))))
    ;; Ray direction = fwd + right*ndcX + up*ndcY
    (local.set $rdx (f32.add (local.get $fwdX) (f32.add (f32.mul (local.get $rX) (local.get $ndcX)) (f32.mul (local.get $upX) (local.get $ndcY)))))
    (local.set $rdy (f32.add (local.get $fwdY) (f32.mul (local.get $upY) (local.get $ndcY))))
    (local.set $rdz (f32.add (local.get $fwdZ) (f32.add (f32.mul (local.get $rZ) (local.get $ndcX)) (f32.mul (local.get $upZ) (local.get $ndcY)))))
    ;; Normalize
    (local.set $rdLen (call $sqrt (f32.add (f32.add
      (f32.mul (local.get $rdx) (local.get $rdx))
      (f32.mul (local.get $rdy) (local.get $rdy)))
      (f32.mul (local.get $rdz) (local.get $rdz))
    )))
    (local.set $rx (f32.div (local.get $rdx) (local.get $rdLen)))
    (local.set $ry (f32.div (local.get $rdy) (local.get $rdLen)))
    (local.set $rz (f32.div (local.get $rdz) (local.get $rdLen)))
    ;; Ray-sphere test for each planet (near-side)
    (local.set $bestIdx (i32.const -1))
    (local.set $bestT (f32.const 999999))
    (local.set $i (i32.const 0))
    (block $done
      (loop $ploop
        (br_if $done (i32.ge_u (local.get $i) (i32.const 6)))
        ;; Read planet world pos from 0x070 + i*12
        (local.set $pbase (i32.add (i32.const 0x070) (i32.mul (local.get $i) (i32.const 12))))
        (local.set $pcx (f32.load (local.get $pbase)))
        (local.set $pcy (f32.load offset=4 (local.get $pbase)))
        (local.set $pcz (f32.load offset=8 (local.get $pbase)))
        (local.set $pr (f32.load (i32.add (i32.const 0x10C) (i32.mul (local.get $i) (i32.const 16)))))
        ;; oc = cam - planet
        (local.set $ocx (f32.sub (local.get $cpx) (local.get $pcx)))
        (local.set $ocy (f32.sub (local.get $cpy) (local.get $pcy)))
        (local.set $ocz (f32.sub (local.get $cpz) (local.get $pcz)))
        ;; b = dot(oc, ray)
        (local.set $b (f32.add (f32.add
          (f32.mul (local.get $ocx) (local.get $rx))
          (f32.mul (local.get $ocy) (local.get $ry)))
          (f32.mul (local.get $ocz) (local.get $rz))
        ))
        ;; c = dot(oc,oc) - r²
        (local.set $c (f32.sub
          (f32.add (f32.add
            (f32.mul (local.get $ocx) (local.get $ocx))
            (f32.mul (local.get $ocy) (local.get $ocy)))
            (f32.mul (local.get $ocz) (local.get $ocz))
          )
          (f32.mul (local.get $pr) (local.get $pr))
        ))
        ;; disc = b² - c
        (local.set $disc (f32.sub (f32.mul (local.get $b) (local.get $b)) (local.get $c)))
        (if (f32.ge (local.get $disc) (f32.const 0))
          (then
            (local.set $t (f32.sub (f32.neg (local.get $b)) (call $sqrt (local.get $disc))))
            (if (i32.and (f32.gt (local.get $t) (f32.const 0)) (f32.lt (local.get $t) (local.get $bestT)))
              (then
                (local.set $bestT (local.get $t))
                (local.set $bestIdx (local.get $i))
              )
            )
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $ploop)
      )
    )
    ;; If no near-side hit, try lensed ray trace
    (if (i32.lt_s (local.get $bestIdx) (i32.const 0))
      (then
        (local.set $bestIdx (call $traceLensedRay
          (local.get $cpx) (local.get $cpy) (local.get $cpz)
          (local.get $rx) (local.get $ry) (local.get $rz)
          (local.get $rH_val) (local.get $spinVal)
        ))
      )
    )
    (local.get $bestIdx)
  )

  ;; ===== Main frame function =====
  (func (export "frame")
    (local $az f32) (local $el f32) (local $dist f32) (local $spinVal f32)
    (local $time f32) (local $mx f32) (local $my f32)
    (local $cosEl f32) (local $sinEl f32) (local $cosAz f32) (local $sinAz f32)
    (local $cpx f32) (local $cpy f32) (local $cpz f32)
    (local $fLen f32) (local $fwdX f32) (local $fwdY f32) (local $fwdZ f32)
    (local $rLen f32) (local $rX f32) (local $rZ f32)
    (local $upX f32) (local $upY f32) (local $upZ f32)
    (local $absSpin f32) (local $a2 f32) (local $rH f32) (local $rIsco f32)
    (local $z1 f32) (local $z2 f32)
    (local $i i32) (local $pbase i32)
    (local $frameTime f32) (local $rs f32) (local $newScale f32)
    (local $hovered i32)
    ;; Read inputs
    (local.set $az (f32.load (i32.const 0x000)))
    (local.set $el (f32.load (i32.const 0x004)))
    (local.set $dist (f32.load (i32.const 0x008)))
    (local.set $spinVal (f32.load (i32.const 0x00C)))
    (local.set $time (f32.load (i32.const 0x010)))
    (local.set $mx (f32.load (i32.const 0x014)))
    (local.set $my (f32.load (i32.const 0x018)))
    ;; Camera vectors
    (local.set $cosEl (call $cos (local.get $el)))
    (local.set $sinEl (call $sin (local.get $el)))
    (local.set $cosAz (call $cos (local.get $az)))
    (local.set $sinAz (call $sin (local.get $az)))
    (local.set $cpx (f32.mul (local.get $dist) (f32.mul (local.get $cosEl) (local.get $sinAz))))
    (local.set $cpy (f32.mul (local.get $dist) (local.get $sinEl)))
    (local.set $cpz (f32.mul (local.get $dist) (f32.mul (local.get $cosEl) (local.get $cosAz))))
    ;; fwd = -camPos / |camPos|
    (local.set $fLen (call $sqrt (f32.add (f32.add
      (f32.mul (local.get $cpx) (local.get $cpx))
      (f32.mul (local.get $cpy) (local.get $cpy)))
      (f32.mul (local.get $cpz) (local.get $cpz))
    )))
    (local.set $fwdX (f32.div (f32.neg (local.get $cpx)) (local.get $fLen)))
    (local.set $fwdY (f32.div (f32.neg (local.get $cpy)) (local.get $fLen)))
    (local.set $fwdZ (f32.div (f32.neg (local.get $cpz)) (local.get $fLen)))
    ;; right = normalize(cross(fwd, (0,1,0))) = normalize(fwdZ, 0, -fwdX)
    (local.set $rLen (call $sqrt (f32.add
      (f32.mul (local.get $fwdZ) (local.get $fwdZ))
      (f32.mul (local.get $fwdX) (local.get $fwdX))
    )))
    (local.set $rX (f32.div (local.get $fwdZ) (local.get $rLen)))
    (local.set $rZ (f32.div (f32.neg (local.get $fwdX)) (local.get $rLen)))
    ;; up = cross(right, fwd) = (rY*fwdZ - rZ*fwdY, rZ*fwdX - rX*fwdZ, rX*fwdY - rY*fwdX)
    ;; rY = 0
    (local.set $upX (f32.neg (f32.mul (local.get $rZ) (local.get $fwdY))))
    (local.set $upY (f32.sub (f32.mul (local.get $rZ) (local.get $fwdX)) (f32.mul (local.get $rX) (local.get $fwdZ))))
    (local.set $upZ (f32.mul (local.get $rX) (local.get $fwdY)))
    ;; Store camera outputs
    (f32.store (i32.const 0x030) (local.get $cpx))
    (f32.store (i32.const 0x034) (local.get $cpy))
    (f32.store (i32.const 0x038) (local.get $cpz))
    (f32.store (i32.const 0x03C) (local.get $fwdX))
    (f32.store (i32.const 0x040) (local.get $fwdY))
    (f32.store (i32.const 0x044) (local.get $fwdZ))
    (f32.store (i32.const 0x048) (local.get $rX))
    (f32.store (i32.const 0x04C) (f32.const 0))
    (f32.store (i32.const 0x050) (local.get $rZ))
    (f32.store (i32.const 0x054) (local.get $upX))
    (f32.store (i32.const 0x058) (local.get $upY))
    (f32.store (i32.const 0x05C) (local.get $upZ))
    ;; Physics: rH = 1 + sqrt(1 - a²)
    (local.set $absSpin (f32.abs (local.get $spinVal)))
    (local.set $a2 (f32.mul (local.get $absSpin) (local.get $absSpin)))
    (local.set $rH (f32.add (f32.const 1) (call $sqrt (f32.max (f32.sub (f32.const 1) (local.get $a2)) (f32.const 0)))))
    ;; rIsco: z1 = 1 + cbrt(1-a²) * (cbrt(1+a) + cbrt(1-a))
    (local.set $z1 (f32.add (f32.const 1)
      (f32.mul
        (call $cbrt (f32.max (f32.sub (f32.const 1) (local.get $a2)) (f32.const 0)))
        (f32.add
          (call $cbrt (f32.add (f32.const 1) (local.get $absSpin)))
          (call $cbrt (f32.max (f32.sub (f32.const 1) (local.get $absSpin)) (f32.const 0)))
        )
      )
    ))
    ;; z2 = sqrt(3*a² + z1²)
    (local.set $z2 (call $sqrt (f32.add (f32.mul (f32.const 3) (local.get $a2)) (f32.mul (local.get $z1) (local.get $z1)))))
    ;; rIsco = 3 + z2 - sqrt((3-z1)*(3+z1+2*z2))
    (local.set $rIsco (f32.sub
      (f32.add (f32.const 3) (local.get $z2))
      (call $sqrt (f32.max
        (f32.mul
          (f32.sub (f32.const 3) (local.get $z1))
          (f32.add (f32.const 3) (f32.add (local.get $z1) (f32.mul (f32.const 2) (local.get $z2))))
        )
        (f32.const 0)
      ))
    ))
    (f32.store (i32.const 0x060) (local.get $rH))
    (f32.store (i32.const 0x064) (local.get $rIsco))
    ;; Compute 6 planet world positions -> store at 0x070
    (local.set $i (i32.const 0))
    (block $pdone
      (loop $ploop
        (br_if $pdone (i32.ge_u (local.get $i) (i32.const 6)))
        (call $getPlanetPos (local.get $i))
        (local.set $pbase (i32.add (i32.const 0x070) (i32.mul (local.get $i) (i32.const 12))))
        (f32.store (local.get $pbase) (global.get $gx))
        (f32.store offset=4 (local.get $pbase) (global.get $gy))
        (f32.store offset=8 (local.get $pbase) (global.get $gz))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $ploop)
      )
    )
    ;; Project 6 planets to screen -> store at 0x0B8
    (local.set $i (i32.const 0))
    (block $sdone
      (loop $sloop
        (br_if $sdone (i32.ge_u (local.get $i) (i32.const 6)))
        (local.set $pbase (i32.add (i32.const 0x070) (i32.mul (local.get $i) (i32.const 12))))
        (call $projectToScreen
          (f32.load (local.get $pbase))
          (f32.load offset=4 (local.get $pbase))
          (f32.load offset=8 (local.get $pbase))
        )
        (local.set $pbase (i32.add (i32.const 0x0B8) (i32.mul (local.get $i) (i32.const 12))))
        (f32.store (local.get $pbase) (global.get $gx))
        (f32.store offset=4 (local.get $pbase) (global.get $gy))
        (f32.store offset=8 (local.get $pbase) (global.get $gz))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $sloop)
      )
    )
    ;; Hover detection
    (if (f32.ge (local.get $mx) (f32.const 0))
      (then
        (local.set $hovered (call $checkHover (local.get $mx) (local.get $my)))
        (i32.store (i32.const 0x068) (local.get $hovered))
      )
      (else
        (i32.store (i32.const 0x068) (i32.const -1))
      )
    )
    ;; Adaptive resolution
    (local.set $frameTime (f32.load (i32.const 0x028)))
    (local.set $rs (f32.load (i32.const 0x024)))
    (if (f32.gt (local.get $frameTime) (f32.const 28))
      (then
        (local.set $newScale (f32.max (f32.const 0.35) (f32.mul (local.get $rs) (f32.const 0.85))))
        (if (f32.gt (f32.abs (f32.sub (local.get $newScale) (local.get $rs))) (f32.const 0.005))
          (then (local.set $rs (local.get $newScale)))
        )
      )
      (else
        (if (f32.lt (local.get $frameTime) (f32.const 20))
          (then
            (local.set $newScale (f32.min (f32.const 1) (f32.mul (local.get $rs) (f32.const 1.05))))
            (if (f32.gt (f32.abs (f32.sub (local.get $newScale) (local.get $rs))) (f32.const 0.005))
              (then (local.set $rs (local.get $newScale)))
            )
          )
        )
      )
    )
    (f32.store (i32.const 0x06C) (local.get $rs))
  )
)
