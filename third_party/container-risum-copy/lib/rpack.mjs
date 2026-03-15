/**
 * RPack WASM loader adapted for Node.js.
 * Based on RisuAI's src/ts/rpack/rpack_bg.js but uses
 * Node.js fs + WebAssembly APIs instead of Vite's ?init import.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WASM_PATH = join(__dirname, '..', 'wasm', 'rpack_bg.wasm');

let wasm = null;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let WASM_VECTOR_LEN = 0;

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (
        cachedDataViewMemory0 === null ||
        cachedDataViewMemory0.buffer.detached === true ||
        (cachedDataViewMemory0.buffer.detached === undefined &&
            cachedDataViewMemory0.buffer !== wasm.memory.buffer)
    ) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

async function initWasm() {
    if (wasm) return;
    const wasmBytes = readFileSync(WASM_PATH);
    const wasmModule = await WebAssembly.compile(wasmBytes);
    const instance = await WebAssembly.instantiate(wasmModule, {});
    wasm = instance.exports;
}

/**
 * Encode data with RPack.
 * @param {Uint8Array} datas
 * @returns {Promise<Uint8Array>}
 */
export async function encodeRPack(datas) {
    await initWasm();
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(datas, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.encode(retptr, ptr0, len0);
        const r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        const r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        const v2 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1, 1);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Decode data with RPack.
 * @param {Uint8Array} datas
 * @returns {Promise<Uint8Array>}
 */
export async function decodeRPack(datas) {
    await initWasm();
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(datas, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.decode(retptr, ptr0, len0);
        const r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        const r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        const v2 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1, 1);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}
