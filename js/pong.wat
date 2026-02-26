(module
  (memory (export "memory") 1)

  ;; Memory layout (little-endian):
  ;; 0x00  f32  player_y
  ;; 0x04  f32  ai_y
  ;; 0x08  f32  ball_x
  ;; 0x0C  f32  ball_y
  ;; 0x10  f32  ball_vx
  ;; 0x14  f32  ball_vy
  ;; 0x18  i32  playerScore
  ;; 0x1C  i32  aiScore
  ;; 0x20  i32  gameRunning (1=running, 0=stopped)
  ;; 0x24  i32  winner (0=none, 1=player, 2=ai)
  ;; 0x28  i32  prngState

  ;; Constants (baked as immediates):
  ;; GAME_WIDTH=800  GAME_HEIGHT=500
  ;; PADDLE_WIDTH=10 PADDLE_HEIGHT=100 BALL_SIZE=10
  ;; PADDLE_SPEED=4.5 AI_SPEED=3.75 BALL_SPEED=3.0
  ;; PLAYER_X=50 AI_X=740 WIN_SCORE=10 AI_DEAD_ZONE=10

  ;; xorshift32 PRNG
  (func $xorshift (result i32)
    (local $s i32)
    (local.set $s (i32.load (i32.const 0x28)))
    (local.set $s (i32.xor (local.get $s) (i32.shl (local.get $s) (i32.const 13))))
    (local.set $s (i32.xor (local.get $s) (i32.shr_u (local.get $s) (i32.const 17))))
    (local.set $s (i32.xor (local.get $s) (i32.shl (local.get $s) (i32.const 5))))
    (i32.store (i32.const 0x28) (local.get $s))
    (local.get $s)
  )

  ;; Random float in [0.0, 1.0)
  (func $xorshiftF (result f32)
    (f32.div
      (f32.convert_i32_u (i32.and (call $xorshift) (i32.const 0x7FFFFFFF)))
      (f32.const 2147483647.0)
    )
  )

  ;; Reset ball to center with random direction
  (func $resetBall
    (f32.store (i32.const 0x08) (f32.const 400.0))
    (f32.store (i32.const 0x0C) (f32.const 250.0))
    ;; vx = (rand > 0.5 ? 1 : -1) * 3.0
    (f32.store (i32.const 0x10)
      (f32.mul
        (select
          (f32.const 1.0)
          (f32.const -1.0)
          (f32.gt (call $xorshiftF) (f32.const 0.5))
        )
        (f32.const 3.0)
      )
    )
    ;; vy = (rand * 2.0 - 1.0) * 3.0
    (f32.store (i32.const 0x14)
      (f32.mul
        (f32.sub
          (f32.mul (call $xorshiftF) (f32.const 2.0))
          (f32.const 1.0)
        )
        (f32.const 3.0)
      )
    )
  )

  ;; init(seed) — seed PRNG and reset all state
  (func (export "init") (param $seed i32)
    (i32.store (i32.const 0x28)
      (select (local.get $seed) (i32.const 1) (local.get $seed))
    )
    (f32.store (i32.const 0x00) (f32.const 200.0))
    (f32.store (i32.const 0x04) (f32.const 200.0))
    (i32.store (i32.const 0x18) (i32.const 0))
    (i32.store (i32.const 0x1C) (i32.const 0))
    (i32.store (i32.const 0x20) (i32.const 1))
    (i32.store (i32.const 0x24) (i32.const 0))
    (call $resetBall)
  )

  ;; reset() — restart game after game over
  (func (export "reset")
    (f32.store (i32.const 0x00) (f32.const 200.0))
    (f32.store (i32.const 0x04) (f32.const 200.0))
    (i32.store (i32.const 0x18) (i32.const 0))
    (i32.store (i32.const 0x1C) (i32.const 0))
    (i32.store (i32.const 0x20) (i32.const 1))
    (i32.store (i32.const 0x24) (i32.const 0))
    (call $resetBall)
  )

  ;; tick(inputMask) — one fixed-timestep game tick
  ;; bit0 = up, bit1 = down
  (func (export "tick") (param $input i32)
    (local $py f32)
    (local $ay f32)
    (local $bx f32)
    (local $by f32)
    (local $vx f32)
    (local $vy f32)
    (local $aiCenter f32)
    (local $hitPos f32)
    (local $sc i32)

    ;; Early exit if game not running
    (if (i32.eqz (i32.load (i32.const 0x20))) (then (return)))

    ;; Load state from memory
    (local.set $py (f32.load (i32.const 0x00)))
    (local.set $ay (f32.load (i32.const 0x04)))
    (local.set $bx (f32.load (i32.const 0x08)))
    (local.set $by (f32.load (i32.const 0x0C)))
    (local.set $vx (f32.load (i32.const 0x10)))
    (local.set $vy (f32.load (i32.const 0x14)))

    ;; Player movement — up (bit0)
    (if (i32.and
          (i32.and (local.get $input) (i32.const 1))
          (f32.gt (local.get $py) (f32.const 0.0)))
      (then
        (local.set $py (f32.sub (local.get $py) (f32.const 4.5)))
      )
    )
    ;; Player movement — down (bit1)
    (if (i32.and
          (i32.ne (i32.and (local.get $input) (i32.const 2)) (i32.const 0))
          (f32.lt (local.get $py) (f32.const 400.0)))
      (then
        (local.set $py (f32.add (local.get $py) (f32.const 4.5)))
      )
    )

    ;; AI movement — track ball with dead zone
    (local.set $aiCenter (f32.add (local.get $ay) (f32.const 50.0)))
    (if (f32.lt (local.get $by) (f32.sub (local.get $aiCenter) (f32.const 10.0)))
      (then
        (local.set $ay (f32.sub (local.get $ay) (f32.const 3.75)))
        (if (f32.lt (local.get $ay) (f32.const 0.0))
          (then (local.set $ay (f32.const 0.0)))
        )
      )
      (else
        (if (f32.gt (local.get $by) (f32.add (local.get $aiCenter) (f32.const 10.0)))
          (then
            (local.set $ay (f32.add (local.get $ay) (f32.const 3.75)))
            (if (f32.gt (local.get $ay) (f32.const 400.0))
              (then (local.set $ay (f32.const 400.0)))
            )
          )
        )
      )
    )

    ;; Ball movement
    (local.set $bx (f32.add (local.get $bx) (local.get $vx)))
    (local.set $by (f32.add (local.get $by) (local.get $vy)))

    ;; Wall bounce (top: y<=0, bottom: y>=490)
    (if (i32.or
          (f32.le (local.get $by) (f32.const 0.0))
          (f32.ge (local.get $by) (f32.const 490.0)))
      (then
        (local.set $vy (f32.neg (local.get $vy)))
      )
    )

    ;; Player paddle collision
    ;; ball.x <= 60 && ball.x >= 50 && ball.y+10 >= py && ball.y <= py+100 && vx < 0
    (if (i32.and
          (i32.and
            (i32.and
              (f32.le (local.get $bx) (f32.const 60.0))
              (f32.ge (local.get $bx) (f32.const 50.0))
            )
            (i32.and
              (f32.ge (f32.add (local.get $by) (f32.const 10.0)) (local.get $py))
              (f32.le (local.get $by) (f32.add (local.get $py) (f32.const 100.0)))
            )
          )
          (f32.lt (local.get $vx) (f32.const 0.0)))
      (then
        (local.set $vx (f32.neg (local.get $vx)))
        (local.set $hitPos
          (f32.div
            (f32.sub (local.get $by) (local.get $py))
            (f32.const 100.0)
          )
        )
        (local.set $vy
          (f32.mul
            (f32.sub (local.get $hitPos) (f32.const 0.5))
            (f32.const 6.0)
          )
        )
        (local.set $bx (f32.const 60.0))
      )
    )

    ;; AI paddle collision
    ;; ball.x+10 >= 740 && ball.x <= 750 && ball.y+10 >= ay && ball.y <= ay+100 && vx > 0
    (if (i32.and
          (i32.and
            (i32.and
              (f32.ge (f32.add (local.get $bx) (f32.const 10.0)) (f32.const 740.0))
              (f32.le (local.get $bx) (f32.const 750.0))
            )
            (i32.and
              (f32.ge (f32.add (local.get $by) (f32.const 10.0)) (local.get $ay))
              (f32.le (local.get $by) (f32.add (local.get $ay) (f32.const 100.0)))
            )
          )
          (f32.gt (local.get $vx) (f32.const 0.0)))
      (then
        (local.set $vx (f32.neg (local.get $vx)))
        (local.set $hitPos
          (f32.div
            (f32.sub (local.get $by) (local.get $ay))
            (f32.const 100.0)
          )
        )
        (local.set $vy
          (f32.mul
            (f32.sub (local.get $hitPos) (f32.const 0.5))
            (f32.const 6.0)
          )
        )
        (local.set $bx (f32.const 730.0))
      )
    )

    ;; Store paddle positions (needed before potential reset from scoring)
    (f32.store (i32.const 0x00) (local.get $py))
    (f32.store (i32.const 0x04) (local.get $ay))

    ;; Score — ball exits left (AI scores)
    (if (f32.lt (local.get $bx) (f32.const 0.0))
      (then
        (local.set $sc (i32.add (i32.load (i32.const 0x1C)) (i32.const 1)))
        (i32.store (i32.const 0x1C) (local.get $sc))
        (call $resetBall)
        (if (i32.ge_u (local.get $sc) (i32.const 10))
          (then
            (i32.store (i32.const 0x20) (i32.const 0))
            (i32.store (i32.const 0x24) (i32.const 2))
          )
        )
        (return)
      )
    )

    ;; Score — ball exits right (player scores)
    (if (f32.gt (local.get $bx) (f32.const 800.0))
      (then
        (local.set $sc (i32.add (i32.load (i32.const 0x18)) (i32.const 1)))
        (i32.store (i32.const 0x18) (local.get $sc))
        (call $resetBall)
        (if (i32.ge_u (local.get $sc) (i32.const 10))
          (then
            (i32.store (i32.const 0x20) (i32.const 0))
            (i32.store (i32.const 0x24) (i32.const 1))
          )
        )
        (return)
      )
    )

    ;; Store ball state (no score this tick)
    (f32.store (i32.const 0x08) (local.get $bx))
    (f32.store (i32.const 0x0C) (local.get $by))
    (f32.store (i32.const 0x10) (local.get $vx))
    (f32.store (i32.const 0x14) (local.get $vy))
  )
)
