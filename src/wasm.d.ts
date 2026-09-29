// Bun's file loader resolves a `.wasm` import to the file's path, embedded in
// the binary by `bun build --compile`.
declare module '*.wasm' {
    const path: string;
    export default path;
}
