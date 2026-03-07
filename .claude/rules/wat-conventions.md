---
paths:
  - "js/*.wat"
description: "WebAssembly Text format conventions and memory layout"
---

# WAT Conventions

## Memory Layout (scene.wat)

The WASM module uses a single shared memory. Key regions:

| Region | Offset | Size | Contents |
|--------|--------|------|----------|
| Camera position | 0x000 | 24 bytes | camX, camY, camZ (f64) |
| Camera direction | 0x018 | 24 bytes | dirX, dirY, dirZ (f64) |
| Camera up | 0x030 | 24 bytes | upX, upY, upZ (f64) |
| Camera right | 0x048 | 24 bytes | rightX, rightY, rightZ (f64) |
| Misc state | 0x060 | 16 bytes | camDist(f64), hover result(i32), etc. |
| Screen projection | 0x0B8 | varies | Planet screen coordinates |
| Planet data | 0x10C+ | 16 bytes/planet | x(f64), z(f64) per planet, then radius(f64) |

Exact offsets may drift — always check the `.wat` source.

## Type Rules

- **Positions, velocities, angles**: f64 (double precision required for physics)
- **Indices, counters, boolean flags**: i32
- **Memory offsets**: i32
- All f64 values must be stored at 8-byte aligned addresses

## Function Conventions

- Exported functions use camelCase: `checkHover`, `projectPlanets`, `updateCamera`
- Internal helper functions use snake_case or descriptive names
- Every exported function must have a comment describing its purpose

## Stack Discipline

- Functions must leave the stack balanced (matching declared result type)
- Use local variables for intermediate results rather than deep stack manipulation
- Avoid stack depths > 4 in complex expressions for readability

## Compilation

The WASM binary is embedded as a base64 string in `index.html`. After modifying a `.wat` file:

1. Compile: `wat2wasm js/scene.wat -o js/scene.wasm`
2. Encode: `base64 js/scene.wasm` and update the base64 string in `index.html`
3. Test: reload the page and verify behavior
