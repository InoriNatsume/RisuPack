/**
 * Core codec for .risum module files.
 *
 * Binary format:
 *   [0x6F magic] [0x00 version]
 *   [4-byte LE length] [RPack(JSON {type:'risuModule', module:...})]
 *   N × { [0x01 marker] [4-byte LE length] [RPack(asset bytes)] }
 *   [0x00 end]
 */
import { encodeRPack, decodeRPack } from './rpack.mjs';

const MAGIC = 0x6F;  // 111
const VERSION = 0x00;

// ── helpers ──

function writeUInt32LE(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    return buf;
}

function writeByte(value) {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value, 0);
    return buf;
}

// ── pack ──

/**
 * Pack a RisuModule JSON + optional asset buffers into a .risum binary.
 * @param {object} module         - The module JSON object
 * @param {Buffer[]} assetBuffers - Array of raw asset file buffers (order must match module.assets)
 * @returns {Promise<Buffer>}
 */
export async function packModule(module, assetBuffers = []) {
    const chunks = [];

    // Strip inline asset data (keep name+type, clear path)
    const exportModule = structuredClone(module);
    if (exportModule.assets) {
        exportModule.assets = exportModule.assets.map(a => [a[0], '', a[2]]);
    }

    // Main JSON chunk
    const mainJSON = JSON.stringify({ module: exportModule, type: 'risuModule' }, null, 2);
    const mainEncoded = await encodeRPack(Buffer.from(mainJSON, 'utf-8'));

    chunks.push(writeByte(MAGIC));
    chunks.push(writeByte(VERSION));
    chunks.push(writeUInt32LE(mainEncoded.length));
    chunks.push(Buffer.from(mainEncoded));

    // Asset chunks
    for (const assetBuf of assetBuffers) {
        const encoded = await encodeRPack(Buffer.from(assetBuf));
        chunks.push(writeByte(0x01));
        chunks.push(writeUInt32LE(encoded.length));
        chunks.push(Buffer.from(encoded));
    }

    // End marker
    chunks.push(writeByte(0x00));

    return Buffer.concat(chunks);
}

// ── unpack ──

/**
 * Unpack a .risum binary into module JSON + asset buffers.
 * @param {Buffer} buf
 * @returns {Promise<{module: object, assets: Buffer[]}>}
 */
export async function unpackModule(buf) {
    let pos = 0;

    const readByte = () => {
        const b = buf.readUInt8(pos);
        pos += 1;
        return b;
    };
    const readLength = () => {
        const len = buf.readUInt32LE(pos);
        pos += 4;
        return len;
    };
    const readData = (len) => {
        const data = buf.subarray(pos, pos + len);
        pos += len;
        return data;
    };

    // Magic
    const magic = readByte();
    if (magic !== MAGIC) {
        throw new Error(`Invalid magic byte: 0x${magic.toString(16)} (expected 0x6F)`);
    }

    // Version
    const version = readByte();
    if (version !== VERSION) {
        throw new Error(`Unsupported version: ${version} (expected 0)`);
    }

    // Main chunk
    const mainLen = readLength();
    const mainData = readData(mainLen);
    const mainDecoded = Buffer.from(await decodeRPack(mainData)).toString('utf-8');
    const main = JSON.parse(mainDecoded);

    if (main.type !== 'risuModule') {
        throw new Error(`Invalid module type: "${main.type}" (expected "risuModule")`);
    }

    const module = main.module;

    // Asset chunks
    const assets = [];
    while (pos < buf.length) {
        const marker = readByte();
        if (marker === 0x00) break;  // end of file
        if (marker !== 0x01) {
            throw new Error(`Unexpected marker: 0x${marker.toString(16)} at pos ${pos - 1}`);
        }
        const len = readLength();
        const data = readData(len);
        const decoded = Buffer.from(await decodeRPack(data));
        assets.push(decoded);
    }

    return { module, assets };
}
