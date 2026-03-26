import { packModule, unpackModule } from "./codec.js";

const RISUM_MAGIC = 0x6f;
const RISUM_VERSION = 0x00;

export async function loadRisumCodec(): Promise<{
  packModule: (module: unknown, assetBuffers?: Buffer[]) => Promise<Buffer>;
  unpackModule: (buf: Buffer) => Promise<{ module: any; assets: Buffer[] }>;
}> {
  return {
    packModule,
    unpackModule
  };
}

export function assertRisumSignature(inputBytes: Buffer): void {
  if (inputBytes.length < 2) {
    throw new Error("risum 헤더를 읽기에는 입력 파일이 너무 짧습니다.");
  }

  if (inputBytes[0] !== RISUM_MAGIC || inputBytes[1] !== RISUM_VERSION) {
    throw new Error(
      "입력 파일의 risum 헤더가 올바르지 않습니다. 확장자와 실제 포맷을 확인해주세요."
    );
  }
}
