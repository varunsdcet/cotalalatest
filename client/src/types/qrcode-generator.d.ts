declare module "qrcode-generator" {
  interface QrCode {
    addData(data: string): void;
    make(): void;
    createSvgTag(options?: { cellSize?: number; margin?: number }): string;
  }
  function qrcode(typeNumber: number, errorCorrectionLevel: string): QrCode;
  export default qrcode;
}
