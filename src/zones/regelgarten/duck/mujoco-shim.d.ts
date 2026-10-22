/**
 * @mujoco/mujoco 3.16.0 ships Emscripten-generated typings that name a JSDoc type `Arguments`
 * (mujoco.d.ts, `ccall`). The project type-checks library typings (skipLibCheck: false), so the
 * duck station gives that name its meaning: the arguments object.
 */
type Arguments = IArguments;
